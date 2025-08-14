const { getLogger } = require('@transitive-sdk/utils');

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

const sendLogs = async (logs, resourceAttributes = {}) => {
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
      const timestampISO = new Date(timestamp).toISOString().replace('T', ' ').replace('Z', '');
      const upperLevel = logObj.level ? logObj.level.toUpperCase() : 'UNSPECIFIED';
      return {
        Timestamp: `toDateTime64('${timestampISO}', 9)`,
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

    // Construct INSERT query for otel_logs table
    const values = clickhouseLogs.map(log => {
      // Format ResourceAttributes as ClickHouse Map
      const resourceAttrsMap = Object.entries(log.ResourceAttributes)
        .map(([key, value]) => `'${key}':'${String(value).replace(/'/g, "''")}'`)
        .join(',');
      const resourceAttrsStr = `{${resourceAttrsMap}}`;
      
      // Format LogAttributes as ClickHouse Map
      const logAttrsMap = Object.entries(log.LogAttributes)
        .map(([key, value]) => `'${key}':'${String(value).replace(/'/g, "''")}'`)
        .join(',');
      const logAttrsStr = `{${logAttrsMap}}`;
      
      return `(${log.Timestamp}, '${log.TraceId}', '${log.SpanId}', ${log.TraceFlags}, '${log.SeverityText}', ${log.SeverityNumber}, '${log.ServiceName}', '${log.Body}', '${log.ResourceSchemaUrl}', ${resourceAttrsStr}, '${log.ScopeSchemaUrl}', '${log.ScopeName}', '${log.ScopeVersion}', {}, ${logAttrsStr})`;
    }).join(',');

    const query = `INSERT INTO otel_logs (Timestamp, TraceId, SpanId, TraceFlags, SeverityText, SeverityNumber, ServiceName, Body, ResourceSchemaUrl, ResourceAttributes, ScopeSchemaUrl, ScopeName, ScopeVersion, ScopeAttributes, LogAttributes) VALUES ${values}`;

    // Send to ClickHouse using POST method
    try {
      const response = await fetch('http://clickhouse:8123', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: query
      });
      if (!response.ok) {
        const errorText = await response.text();
        log.error('Failed to send logs to ClickHouse:', response.status, response.statusText, errorText);
      } else {
        log.debug(`${logs.length} logs sent to ClickHouse successfully`);
      }
    } catch (error) {
      log.warn('Failed to insert logs into ClickHouse:', error);
    }
  } catch (error) {
    log.error('Failed to send logs to ClickHouse:', error);
  }
}

/**
 * Sends metrics for all monitored packages to ClickHouse
 * @param {Object} metricsData - Object containing package names as keys and arrays of samples as values
 * @param {Object} resourceAttributes - Resource attributes to add to all metrics
 */
const sendMetrics = async (metricsData, resourceAttributes = {}) => {
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
        TimeUnix: `toDateTime64('${timestampISO}', 9)`,
        ServiceName: packageName,
        Value: samples?.cpu?.[index] || 0,
        MetricName: 'cpu_usage_percent',
        MetricDescription: 'CPU usage percentage',
        MetricUnit: '%',
        ResourceAttributes: mergedResourceAttributes
      });
      
      // Add memory usage metric
      allMetrics.push({
        TimeUnix: `toDateTime64('${timestampISO}', 9)`,
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
          TimeUnix: `toDateTime64('${timestampISO}', 9)`,
          ServiceName: packageName,
          Value: samples.system?.cpu?.[index] || 0,
          MetricName: 'system_cpu_usage_percent',
          MetricDescription: 'System CPU usage percentage',
          MetricUnit: '%',
          ResourceAttributes: mergedResourceAttributes
        });
        
        allMetrics.push({
          TimeUnix: `toDateTime64('${timestampISO}', 9)`,
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
  
  // Construct single INSERT query for all metrics
  const values = allMetrics.map(metric => {
    // Format ResourceAttributes as ClickHouse Map
    const resourceAttrsMap = Object.entries(metric.ResourceAttributes)
      .map(([key, value]) => `'${key}':'${String(value).replace(/'/g, "''")}'`)
      .join(',');
    const resourceAttrsStr = `{${resourceAttrsMap}}`;
    
    return `(${metric.TimeUnix}, '${metric.ServiceName}', ${metric.Value}, '${metric.MetricName}', '${metric.MetricDescription}', '${metric.MetricUnit}', ${resourceAttrsStr})`;
  }).join(',');
  
  const query = `INSERT INTO otel_metrics_gauge (TimeUnix, ServiceName, Value, MetricName, MetricDescription, MetricUnit, ResourceAttributes) VALUES ${values}`;
  log.debug('Constructed ClickHouse query for metrics:', query);
  try {
    const response = await fetch('http://clickhouse:8123', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: query
    });
    if (!response.ok) {
      const errorText = await response.text();
      log.error('Failed to send metrics to ClickHouse:', response.status, response.statusText, errorText);
    } else {
      log.debug(`${allMetrics.length} metrics sent to ClickHouse successfully`);
    }
  } catch (error) {
    log.error('Failed to insert metrics into ClickHouse:', error);
  }
}

module.exports = {
  sendLogs,
  sendMetrics,
}
