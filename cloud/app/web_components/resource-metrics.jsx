import React from 'react';
import { Sparklines, SparklinesLine, SparklinesReferenceLine } from 'react-sparklines';

const _ = {
  get: require('lodash/get'),
  takeRight: require('lodash/takeRight'),
  maxBy: require('lodash/maxBy'),
  mean: require('lodash/mean'),
};

import { getLogger } from '@transitive-sdk/utils-web';

const log = getLogger('resource-metrics');
log.setLevel('debug');

const F = React.Fragment;

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
  systemCpuValue: {
    color: '#9b59b6',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
  },
  systemMemoryValue: {
    color: '#f39c12',
    backgroundColor: 'rgba(243, 156, 18, 0.1)',
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
const ResourceMetrics = ({ metrics }) => {
  if (!metrics || (!metrics.cpu && !metrics.memory)) {
    return (
      <div style={styles.noData}>
        No metrics data available yet
      </div>
    );
  }

  const cpuData = metrics.cpu || [];
  const memoryData = metrics.memory || [];
  
  let systemCpuData, systemMemoryData;
  const hasSystemMetrics = metrics.system;
  // Extract system metrics if available (only for robot-agent)
  if (hasSystemMetrics) {
    systemCpuData = metrics.system.cpu || [];
    systemMemoryData = metrics.system.memory || [];
  }
  
  // Calculate averages
  const avgCpu = _.mean(cpuData);
  const avgMemory = _.mean(memoryData);
  const avgSystemCpu = hasSystemMetrics ? _.mean(systemCpuData) : 0;
  const avgSystemMemory = hasSystemMetrics ? _.mean(systemMemoryData) : 0;
  
  const latestCpu = cpuData[cpuData.length - 1] || 0;
  const latestMemory = memoryData[memoryData.length - 1] || 0;
  const latestSystemCpu = hasSystemMetrics ? (systemCpuData[systemCpuData.length - 1] || 0) : 0;
  const latestSystemMemory = hasSystemMetrics ? (systemMemoryData[systemMemoryData.length - 1] || 0) : 0;

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
      
      {hasSystemMetrics && (
        <F>
          <div style={styles.metricRow}>
            <span style={styles.metricLabel}>Sys CPU:</span>
            <span style={{...styles.currentValue, ...styles.systemCpuValue}}>
              {formatCpu(latestSystemCpu)}
            </span>
            <div style={styles.inlineChart}>
              <Sparklines data={systemCpuData} height={20} width={120} margin={2}>
                <SparklinesLine color="#9b59b6" style={{ strokeWidth: 1.5 }} />
                <SparklinesReferenceLine type="mean" style={{ stroke: '#9b59b6', strokeOpacity: 0.3, strokeDasharray: '1,1' }} />
              </Sparklines>
            </div>
            <span style={styles.avgValue}>avg: {formatCpu(avgSystemCpu)}</span>
          </div>
          
          <div style={styles.metricRow}>
            <span style={styles.metricLabel}>Sys Mem:</span>
            <span style={{...styles.currentValue, ...styles.systemMemoryValue}}>
              {formatBytes(latestSystemMemory)}
            </span>
            <div style={styles.inlineChart}>
              <Sparklines data={systemMemoryData} height={20} width={120} margin={2}>
                <SparklinesLine color="#f39c12" style={{ strokeWidth: 1.5 }} />
                <SparklinesReferenceLine type="mean" style={{ stroke: '#f39c12', strokeOpacity: 0.3, strokeDasharray: '1,1' }} />
              </Sparklines>
            </div>
            <span style={styles.avgValue}>avg: {formatBytes(avgSystemMemory)}</span>
          </div>
        </F>
      )}
    </div>
  );
};

export default ResourceMetrics;
