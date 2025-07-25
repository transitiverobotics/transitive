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
        log.debug('Logs sent to ClickHouse successfully');
      }
    } catch (error) {
      log.warn('Failed to insert logs into ClickHouse:', error);
    }
  } catch (error) {
    log.error('Failed to send logs to ClickHouse:', error);
  }
}

/**
 * Sends a single metric to ClickHouse
 * @param {string} name - Metric name
 * @param {string} description - Metric description
 * @param {string} unit - Metric unit
 * @param {number} value - Metric value
 * @param {number} timestamp - Timestamp in milliseconds
 * @param {string} serviceName - Service name for the metric
 * @param {Object} resourceAttributes - Resource attributes to add to the metric
 */
const sendMetric = async (name, description, unit, value, timestamp, serviceName, resourceAttributes = {}) => {
  const timestampISO = new Date(timestamp||Date.now()).toISOString().replace('T', ' ').replace('Z', '');
  log.debug(`Sending metric ${name} with value ${value} at ${timestampISO}`);
  const sampleValues = {
    TimeUnix: `toDateTime64('${timestampISO}', 9)`,          
    ServiceName: serviceName,
    Value: value,
    MetricName: name,
    MetricDescription: description,
    MetricUnit: unit,
    ResourceAttributes: {...resourceAttributes, 'service.name': serviceName}
  };
  // Format ResourceAttributes as ClickHouse Map
  const resourceAttrsMap = Object.entries(sampleValues.ResourceAttributes)
    .map(([key, value]) => `'${key}':'${String(value).replace(/'/g, "''")}'`)
    .join(',');
  const resourceAttrsStr = `{${resourceAttrsMap}}`;
  // Construct INSERT query for otel_metrics_gauge table
  const query = `INSERT INTO otel_metrics_gauge (TimeUnix, ServiceName, Value, MetricName, MetricDescription, MetricUnit, ResourceAttributes) VALUES (${sampleValues.TimeUnix }, '${sampleValues.ServiceName}', ${sampleValues.Value}, '${sampleValues.MetricName}', '${sampleValues.MetricDescription}', '${sampleValues.MetricUnit}', ${resourceAttrsStr})`;

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
      log.error('Failed to send metric to ClickHouse:', response.status, response.statusText, errorText);
    } else {
      log.debug('Metric sent to ClickHouse successfully:', name);
    }
  } catch (error) {
    log.error('Failed to insert metric into ClickHouse:', error);
  }
}

/**
 * Sends metrics for all monitored packages to ClickHouse
 * @param {Object} metricsData - Object containing package names as keys and arrays of samples as values
 * @param {Object} resourceAttributes - Resource attributes to add to all metrics
 */
const sendMetrics = async (metricsData, resourceAttributes = {}) => {
  log.debug('Sending metrics to ClickHouse...', metricsData);
  for (const [packageName, samples] of Object.entries(metricsData)) {
    if (!Array.isArray(samples) || samples.length === 0) continue;
    // Prepare metrics for ClickHouse insertion
    for (const sample of samples) {
      await sendMetric(
        'cpu_usage_percent',
        'CPU usage percentage',
        '%',
        sample.cpu || 0,
        sample.timestamp || Date.now(),
        packageName,
        resourceAttributes
      );
      await sendMetric(
        'memory_usage_bytes',
        'Memory usage in bytes',
        'bytes',
        sample.memory || 0,
        sample.timestamp || Date.now(),
        packageName,
        resourceAttributes
      );
      if (sample.system) {
        await sendMetric(
          'system_cpu_usage_percent',
          'System CPU usage percentage',
          '%',
          sample.system.cpu || 0,
          sample.timestamp || Date.now(),
          packageName,
          resourceAttributes
        );
        await sendMetric(
          'system_memory_usage_bytes',
          'System memory usage in bytes',
          'bytes',
          sample.system.memory || 0,
          sample.timestamp || Date.now(),
          packageName,
          resourceAttributes
        );
      }
    }
  }
}

module.exports = {
  sendLogs,
  sendMetrics,
}
