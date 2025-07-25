const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { resourceFromAttributes } = require('@opentelemetry/resources');
const { SeverityNumber } = require('@opentelemetry/api-logs');
const { getLogger } = require('@transitive-sdk/utils');

const log = getLogger('telemetry');
log.setLevel('info');

class TelemetryService {
  constructor() {
    this.logProcessor = null;
    this.hyperDXIngestionAPIKey = null;
  }

  async initialize(hyperDXIngestionAPIKey) {
    this.hyperDXIngestionAPIKey = hyperDXIngestionAPIKey;

    try {
      log.debug('Creating OTLP exporter with proper configuration...');
      
      // Create OTLP exporter - simplified configuration
      const logExporter = new OTLPLogExporter({
        url: 'http://otel-collector:4318/v1/logs',
        headers: {
          'authorization': this.hyperDXIngestionAPIKey,
          'content-Type': 'application/json',
        },
        timeoutMillis: 5000,
      });

      log.debug('Creating log processor...');
      const logProcessor = new BatchLogRecordProcessor(logExporter,
        {
          maxExportBatchSize: 100, // Adjust batch size as needed
          scheduledDelayMillis: 5000, // Adjust delay for batching
          exportTimeoutMillis: 3000, // Timeout for each export
        }
      );
      this.logProcessor = logProcessor;

      log.info('OpenTelemetry native logger initialized successfully');
    } catch (error) {
      log.error('Failed to initialize OpenTelemetry logger:', error);
    }
  }

  /**
   * Convert log level string to OpenTelemetry SeverityNumber
   */
  getSeverityNumber(level) {
    const levelMap = {
      'TRACE': SeverityNumber.TRACE,
      'DEBUG': SeverityNumber.DEBUG,
      'INFO': SeverityNumber.INFO,
      'WARN': SeverityNumber.WARN,
      'ERROR': SeverityNumber.ERROR,
      'FATAL': SeverityNumber.FATAL
    };
    return levelMap[level] || SeverityNumber.UNSPECIFIED;
  }

  /**
   * Send logs to HyperDX using native OpenTelemetry logger
   * @param {Array|Object} logs - Log entries or single log entry
   * @param {Object} resourceAttributes - Resource attributes to add to all logs
   */
  async sendLogs(logs, resourceAttributes = {}) {
    if (!Array.isArray(logs)) {
      logs = [logs];
    }
    try {
      // create new logger with resource attributes
      if (!this.logProcessor) {
        log.error('OpenTelemetry logger provider is not initialized');
        throw new Error('Logger provider not initialized');
      }
      const resource = resourceFromAttributes(resourceAttributes);
      // Create logger provider with resource and processors
      const loggerProvider = new LoggerProvider({ 
        resource,
        processors: [this.logProcessor]
      });
      // Get a logger instance
      const logger = loggerProvider.getLogger('logMonitor');      

      // Process each log through the OpenTelemetry logger
      logs.forEach((logObj, index) => {       
        // Create log record using OpenTelemetry API
        const logRecord = {
          timeUnixNano: (logObj.timestamp || Date.now()) * 1e6,
          observedTimeUnixNano: Date.now() * 1e6,
          severityNumber: logObj.logLevelValue || this.getSeverityNumber(logObj.level) || SeverityNumber.INFO,
          severityText: logObj.level || 'INFO',
          body: logObj.message || '',
          attributes: {
            module: logObj.module || 'unknown',
          }
        };

        // Emit the log record
        logger.emit(logRecord);
      });

      // Force flush to ensure logs are sent immediately
      await loggerProvider.forceFlush();
    } catch (error) {
      log.error('Failed to send logs via OpenTelemetry logger:', error);
      throw error;
    }
  }
}

module.exports = TelemetryService;
