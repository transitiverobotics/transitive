
const _ = require('lodash');
const { createClient } = require('@clickhouse/client');

const { getLogger } = require('@transitive-sdk/utils');

const log = getLogger('telemetry');
log.setLevel('info');

const getSeverityNumber = (level) => {
  const levelMap = {
    'unspecified': 0,
    'trace': 1,
    'debug': 5,
    'info': 9,
    'warn': 13,
    'error': 17,
    'fatal': 21
  };
  return levelMap[level] || levelMap['unspecified'];
};

/** Convert timestamp (seconds since epoch) to TimeUnix */
const timeToUnix = (time) =>
    new Date(time).toISOString().replace('T', ' ').replace('Z', '');

/** Class for sending logs and metrics to ClickHouse. */
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

  async init() {
    log.info('Initializing TelemetryService');
    // create logs and metrics tables if they do not exist
    try {
      log.info('Creating logs table if it does not exist');
      await this.clickHouseClient.command({
        query: `
          CREATE TABLE IF NOT EXISTS default.logs (
            Timestamp DateTime64(9) CODEC(Delta(8), ZSTD(1)),
            TimestampTime DateTime DEFAULT toDateTime(Timestamp),
            TraceId String CODEC(ZSTD(1)),
            SpanId String CODEC(ZSTD(1)),
            TraceFlags UInt8,
            SeverityText LowCardinality(String) CODEC(ZSTD(1)),
            SeverityNumber UInt8,
            ServiceName LowCardinality(String) CODEC(ZSTD(1)),
            Body String CODEC(ZSTD(1)),
            ResourceSchemaUrl LowCardinality(String) CODEC(ZSTD(1)),
            ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            ScopeSchemaUrl LowCardinality(String) CODEC(ZSTD(1)),
            ScopeName String CODEC(ZSTD(1)),
            ScopeVersion LowCardinality(String) CODEC(ZSTD(1)),
            ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            LogAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
            INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_body Body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 8
          )
          ENGINE = MergeTree
          PARTITION BY toDate(TimestampTime)
          PRIMARY KEY (ServiceName, TimestampTime)
          ORDER BY (ServiceName, TimestampTime, Timestamp)
          TTL TimestampTime + toIntervalDay(3)
          SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
        `,
        clickhouse_settings: {
          wait_end_of_query: 1,
        }
      });

      await this.clickHouseClient.command({
        query:`
          CREATE TABLE IF NOT EXISTS default.metrics
          (
            ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            ResourceSchemaUrl String CODEC(ZSTD(1)),
            ScopeName String CODEC(ZSTD(1)),
            ScopeVersion String CODEC(ZSTD(1)),
            ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            ScopeDroppedAttrCount UInt32 CODEC(ZSTD(1)),
            ScopeSchemaUrl String CODEC(ZSTD(1)),
            ServiceName LowCardinality(String) CODEC(ZSTD(1)),
            MetricName String CODEC(ZSTD(1)),
            MetricDescription String CODEC(ZSTD(1)),
            MetricUnit String CODEC(ZSTD(1)),
            Attributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
            StartTimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
            TimeUnix DateTime64(9) CODEC(Delta(8), ZSTD(1)),
            Value Float64 CODEC(ZSTD(1)),
            Flags UInt32 CODEC(ZSTD(1)),
            \`Exemplars.FilteredAttributes\` Array(Map(LowCardinality(String), String)) CODEC(ZSTD(1)),
            \`Exemplars.TimeUnix\` Array(DateTime64(9)) CODEC(ZSTD(1)),
            \`Exemplars.Value\` Array(Float64) CODEC(ZSTD(1)),
            \`Exemplars.SpanId\` Array(String) CODEC(ZSTD(1)),
            \`Exemplars.TraceId\` Array(String) CODEC(ZSTD(1)),
            INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_attr_key mapKeys(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1,
            INDEX idx_attr_value mapValues(Attributes) TYPE bloom_filter(0.01) GRANULARITY 1
          )
          ENGINE = MergeTree
          PARTITION BY toDate(TimeUnix)
          ORDER BY (ServiceName, MetricName, Attributes, toUnixTimestamp64Nano(TimeUnix))
          TTL toDateTime(TimeUnix) + toIntervalDay(3)
          SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
        `,
        clickhouse_settings: {
          wait_end_of_query: 1,
        }
      });
      log.info('Telemetry tables created or already exist');
    } catch (error) {
      log.error('Failed to create telemetry tables:', error);
      throw error;
    }
  }

  sendLogs = async (logs, resourceAttributes = {}) => {
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
        const levelLowercase = logObj.level ? logObj.level.toLowerCase() : 'unspecified';
        return {
          Timestamp: timestampISO, //`toDateTime64('${timestampISO}', 9)`,
          TraceId: '', // Empty for now, could be populated if available
          SpanId: '', // Empty for now, could be populated if available
          TraceFlags: 0,
          SeverityText: levelLowercase,
          SeverityNumber: logObj.logLevelValue || getSeverityNumber(levelLowercase),
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
        table: 'logs',
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

    if (!metricsData?.time.length) return;

    const allMetrics = [];

    // Add system metrics
    for (const index in metricsData.time) {
      const time = metricsData.time[index];
      const packageName = '@transitive-robotics/robot-agent';

      const sharedAttributes = {
        TimeUnix: timeToUnix(time),
        ServiceName: packageName,
        ResourceAttributes: {...resourceAttributes, 'service.name': packageName}
      };

      const cpu = metricsData.system?.cpu?.[index];
      cpu !== undefined && allMetrics.push({
        ...sharedAttributes,
        Value: cpu,
        MetricName: 'system_cpu_usage_percent',
        MetricDescription: 'System CPU usage percentage',
        MetricUnit: '%',
      });

      const mem = metricsData.system?.mem?.[index];
      mem !== undefined && allMetrics.push({
        ...sharedAttributes,
        Value: mem,
        MetricName: 'system_memory_usage_percent',
        MetricDescription: 'System memory usage percent',
        MetricUnit: '%',
      });
    }

    // Add per-package metrics
    _.forEach(metricsData.packages, (samples, packageName) => {
      log.debug(`Processing metrics for package: ${packageName}`, samples);

      for (const index in metricsData.time) {
        const time = metricsData.time[index];
        const cpu = samples[index];
        cpu !== undefined && allMetrics.push({
          TimeUnix: timeToUnix(time),
          ServiceName: packageName,
          ResourceAttributes: {...resourceAttributes, 'service.name': packageName},
          Value: cpu,
          MetricName: 'cpu_usage_percent',
          MetricDescription: 'CPU usage percentage',
          MetricUnit: '%',
        });
      }
    });

    if (allMetrics.length === 0) {
      log.debug('No metrics to send');
      return;
    }

    // Use ClickHouse client to insert metrics
    this.clickHouseClient?.insert({
      table: 'metrics',
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
