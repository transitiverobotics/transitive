const { getLogger } = require('@transitive-sdk/utils');
const { createClient } = require('@clickhouse/client');

const log = getLogger('telemetry');
log.setLevel('info');

const getSeverityNumber = (level) => {
  const levelMap = {
    'UNSPECIFIED': 0,
    'TRACE': 1,
    'DEBUG': 5,
    'INFO': 9,
    'WARN': 13,
    'ERROR': 17,
    'FATAL': 21
  };
  return levelMap[level] || levelMap['UNSPECIFIED'];
}

class TelemetryService {
  constructor() {
    log.debug('Creating TelemetryService');
    try {
      this.clickHouseClient = createClient({
        url: 'http://clickhouse:8123',
        max_open_connections: 10,
        clickhouse_settings: {
          // https://clickhouse.com/docs/en/operations/settings/settings#async-insert
          async_insert: 1,
          // https://clickhouse.com/docs/en/operations/settings/settings#wait-for-async-insert
          wait_for_async_insert: 1,
          // https://clickhouse.com/docs/en/operations/settings/settings#async-insert-max-data-size
          async_insert_max_data_size: '1000000',
          // https://clickhouse.com/docs/en/operations/settings/settings#async-insert-busy-timeout-ms
          async_insert_busy_timeout_ms: 1000,
          // Allows to insert serialized JS Dates (such as '2023-12-06T10:54:48.000Z')
          date_time_input_format: 'best_effort',
        },
      });
      log.info('ClickHouse client created successfully');
    } catch (error) {
      log.error('Failed to create ClickHouse client:', error);
      throw error;
    }
  }
  sendLogs = async (logs, resourceAttributes = {}) => {
    if (!Array.isArray(logs)) {
      logs = [logs];
    }
    
    if (logs.length === 0) {
      log.debug('No logs to send');
      return;
    }
    
    try {
      log.debug('Sending logs ClickHouse...', logs.length, 'logs to send');
      
      // Prepare logs for ClickHouse insertion with correct otel_logs schema
      const clickhouseLogs = logs.map(logObj => {
        const timestamp = logObj.timestamp || Date.now();
        const timestampISO = new Date(timestamp).toISOString();//.replace('T', ' ').replace('Z', '');
        const upperLevel = logObj.level ? logObj.level.toUpperCase() : 'UNSPECIFIED';
        return {
          Timestamp: timestampISO, //`toDateTime64('${timestampISO}', 9)`,
          TraceId: '', // Empty for now, could be populated if available
          SpanId: '', // Empty for now, could be populated if available
          TraceFlags: 0,
          SeverityText: upperLevel,
          SeverityNumber: logObj.logLevelValue || getSeverityNumber(upperLevel),
          ServiceName: resourceAttributes['service.name'] || 'unknown-service',
          Body: (logObj.message || '').replace(/'/g, "''").replace(/\\/g, '\\\\'),
          ResourceSchemaUrl: '',
          ResourceAttributes: resourceAttributes,
          ScopeSchemaUrl: '',
          ScopeName: 'telemetry-service',
          ScopeVersion: '1.0.0',
          ScopeAttributes: {},
          LogAttributes: {
            module: logObj.module || 'unknown',
            ...logObj.attributes
          }
        };
      });

      // Use ClickHouse client to insert logs
      this.clickHouseClient?.insert({
        table: 'otel_logs',
        values: clickhouseLogs,
        format: 'JSONEachRow',
      }).then(() => {
        log.debug(`${clickhouseLogs.length} logs sent to ClickHouse successfully`);
      }).catch(err => {
        log.error('Failed to send logs to ClickHouse:', err);
      }); 
    } catch (error) {
      log.error('Failed to send logs to ClickHouse:', error);
    }
  }

  /**
   * Sends metrics for all monitored packages to ClickHouse
   * @param {Object} metricsData - Object containing package names as keys and arrays of samples as values
   * @param {Object} resourceAttributes - Resource attributes to add to all metrics
   */
  sendMetrics = async (metricsData, resourceAttributes = {}) => {
    log.debug('Sending metrics to ClickHouse...', metricsData);
    
    const allMetrics = [];
    if(!metricsData || !metricsData.samplesPerPackage || Object.keys(metricsData.samplesPerPackage).length === 0) {
      log.debug('No metrics to send');
      return;
    }
    for (const [packageName, samples] of Object.entries(metricsData.samplesPerPackage)) {
      log.debug(`Processing metrics for package: ${packageName}`, samples);
      // Prepare metrics for ClickHouse insertion
      for (const [index, timestamp] of metricsData?.timestamps?.entries() || []) {
        const timestampISO = new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
        const mergedResourceAttributes = {...resourceAttributes, 'service.name': packageName};
        
        // Add CPU usage metric
        allMetrics.push({
          TimeUnix: timestampISO,
          ServiceName: packageName,
          Value: samples?.cpu?.[index] || 0,
          MetricName: 'cpu_usage_percent',
          MetricDescription: 'CPU usage percentage',
          MetricUnit: '%',
          ResourceAttributes: mergedResourceAttributes
        });
        
        // Add memory usage metric
        allMetrics.push({
          TimeUnix: timestampISO,
          ServiceName: packageName,
          Value: samples?.memory?.[index] || 0,
          MetricName: 'memory_usage_bytes',
          MetricDescription: 'Memory usage in bytes',
          MetricUnit: 'bytes',
          ResourceAttributes: mergedResourceAttributes
        });
        
        // Add system metrics if available
        if (samples.system) {
          allMetrics.push({
            TimeUnix: timestampISO,
            ServiceName: packageName,
            Value: samples.system?.cpu?.[index] || 0,
            MetricName: 'system_cpu_usage_percent',
            MetricDescription: 'System CPU usage percentage',
            MetricUnit: '%',
            ResourceAttributes: mergedResourceAttributes
          });
          
          allMetrics.push({
            TimeUnix: timestampISO,
            ServiceName: packageName,
            Value: samples.system?.memory?.[index] || 0,
            MetricName: 'system_memory_usage_bytes',
            MetricDescription: 'System memory usage in bytes',
            MetricUnit: 'bytes',
            ResourceAttributes: mergedResourceAttributes
          });
        }
      }
    }
    
    if (allMetrics.length === 0) {
      log.debug('No metrics to send');
      return;
    }

    // Use ClickHouse client to insert metrics
    this.clickHouseClient?.insert({
      table: 'otel_metrics_gauge',
      values: allMetrics,
      format: 'JSONEachRow',
    }).then(() => {
      log.debug(`${allMetrics.length} metrics sent to ClickHouse successfully`);
    }).catch(err => {
      log.error('Failed to send metrics to ClickHouse:', err);
    });
  }
}

module.exports = {
  TelemetryService
}
