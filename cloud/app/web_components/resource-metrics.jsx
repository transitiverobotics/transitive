import React, { useState, useEffect } from 'react';
import { Card } from 'react-bootstrap';
import { Sparklines, SparklinesLine, SparklinesSpots, SparklinesReferenceLine } from 'react-sparklines';

const _ = {
  get: require('lodash/get'),
  takeRight: require('lodash/takeRight'),
  maxBy: require('lodash/maxBy'),
  mean: require('lodash/mean'),
};

import { getLogger } from '@transitive-sdk/utils-web';

const log = getLogger('resource-metrics');
log.setLevel('debug');

const styles = {
  metricsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5em',
  },
  metricRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5em',
    fontSize: '0.8em',
  },
  metricLabel: {
    fontWeight: '500',
    minWidth: '50px',
    color: '#495057',
  },
  inlineChart: {
    flex: 1,
    maxWidth: '120px',
  },
  currentValue: {
    fontSize: '0.75em',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px',
    minWidth: '60px',
    textAlign: 'center',
  },
  avgValue: {
    fontSize: '0.7em',
    color: '#6c757d',
    minWidth: '60px',
  },
  cpuValue: {
    color: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
  },
  memoryValue: {
    color: '#e74c3c',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  noData: {
    fontSize: '0.8em',
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '1em',
    backgroundColor: '#f8f9fa',
  },
};

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatCpu = (cpu) => {
  return `${cpu.toFixed(1)}%`;
};

/** Component to display resource metrics for CPU and Memory usage */
const ResourceMetrics = ({ mqttSync, agentPrefix, packageName }) => {
  const [metrics, setMetrics] = useState([]);

  useEffect(() => {
    if (!mqttSync || !agentPrefix || !packageName) return;

    const metricsPath = `${agentPrefix}/status/metrics/${packageName}`;
    log.debug(`Subscribing to metrics for ${packageName} at ${metricsPath}`);
    
    mqttSync.subscribe(metricsPath);
    
    const updateMetrics = (data) => {
      log.debug(`Received metrics data for ${packageName}:`, data);
      if (Array.isArray(data) && data.length > 0) {
        // Keep only the last 50 data points for display
        setMetrics(_.takeRight(data, 50));
      }
    };

    // Get initial data
    const initialData = mqttSync.data.getByTopic(metricsPath);
    if (initialData) {
      updateMetrics(initialData);
    }

    // Subscribe to updates
    const unsubscribe = mqttSync.data.subscribePath(metricsPath, updateMetrics);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [mqttSync, agentPrefix, packageName]);

  if (!metrics || metrics.length === 0) {
    return (
      <div style={styles.noData}>
        No metrics data available yet
      </div>
    );
  }

  const cpuData = metrics.map(m => m.cpu || 0);
  const memoryData = metrics.map(m => m.memory || 0);
  
  // Calculate averages
  const avgCpu = _.mean(cpuData);
  const avgMemory = _.mean(memoryData);
  
  const latestCpu = cpuData[cpuData.length - 1] || 0;
  const latestMemory = memoryData[memoryData.length - 1] || 0;

  return (
    <div style={styles.metricsContainer}>
      <div style={styles.metricRow}>
        <span style={styles.metricLabel}>CPU:</span>
        <span style={{...styles.currentValue, ...styles.cpuValue}}>
          {formatCpu(latestCpu)}
        </span>
        <div style={styles.inlineChart}>
          <Sparklines data={cpuData} height={20} width={120} margin={2}>
            <SparklinesLine color="#3498db" style={{ strokeWidth: 1.5 }} />
            <SparklinesReferenceLine type="mean" style={{ stroke: '#3498db', strokeOpacity: 0.3, strokeDasharray: '1,1' }} />
          </Sparklines>
        </div>
        <span style={styles.avgValue}>avg: {formatCpu(avgCpu)}</span>
      </div>
      
      <div style={styles.metricRow}>
        <span style={styles.metricLabel}>Memory:</span>
        <span style={{...styles.currentValue, ...styles.memoryValue}}>
          {formatBytes(latestMemory)}
        </span>
        <div style={styles.inlineChart}>
          <Sparklines data={memoryData} height={20} width={120} margin={2}>
            <SparklinesLine color="#e74c3c" style={{ strokeWidth: 1.5 }} />
            <SparklinesReferenceLine type="mean" style={{ stroke: '#e74c3c', strokeOpacity: 0.3, strokeDasharray: '1,1' }} />
          </Sparklines>
        </div>
        <span style={styles.avgValue}>avg: {formatBytes(avgMemory)}</span>
      </div>
    </div>
  );
};

export default ResourceMetrics;
