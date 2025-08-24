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
  currentValue: {
    fontSize: '0.75em',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px',
    minWidth: '60px',
    textAlign: 'center',
  },
  cpuValue: {
    color: '#3498db',
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
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
  // Sparklines:
  referenceLine: {
    strokeOpacity: 0.3,
    strokeDasharray: '1,1'
  }
};

/** Format number as percentage */
const formatPercentage = (x) => `${x.toFixed(1)} %`;

/** Draw a Sparkline with the given data and color, applying our common style */
const Chart = ({data, color}) =>
  <div style={{
    flex: 1,
    maxWidth: '80px',
    backgroundColor: `${color}40` // semi-transparent
  }}>
    <Sparklines data={data} height={20} width={80} margin={2} max={100} min={0}>
      <SparklinesLine color={color} style={{ strokeWidth: 1.5 }} />
      <SparklinesReferenceLine type="mean"
        style={{ stroke: color, ...styles.referenceLine }} />
    </Sparklines>
  </div>;


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

  const latestCpu = cpuData[cpuData.length - 1] || 0;
  const latestSystemCpu = hasSystemMetrics ?
    (systemCpuData[systemCpuData.length - 1] || 0) : 0;
  const latestSystemMemory = hasSystemMetrics ?
    (systemMemoryData[systemMemoryData.length - 1] || 0) : 0;

  return (
    <div style={styles.metricsContainer}>
      <div style={styles.metricRow}>
        <span style={{...styles.currentValue, ...styles.cpuValue}}>
          {`CPU: ${formatPercentage(latestCpu)}`}
        </span>

        <Chart data={cpuData} color="#3498db" />
      </div>


      {hasSystemMetrics && (
        <F>
          <div style={styles.metricRow}>
            <span style={{...styles.currentValue, ...styles.systemCpuValue}}>
              {`System CPU: ${formatPercentage(latestSystemCpu)}`}
            </span>

            <Chart data={systemCpuData} color="#9b59b6" />
          </div>

          <div style={styles.metricRow}>
            <span style={{...styles.currentValue, ...styles.systemMemoryValue}}>
              {`System Memory: ${formatPercentage(latestSystemMemory)}`}
            </span>

            <Chart data={systemMemoryData} color="#f39c12" />
          </div>
        </F>
      )}
    </div>
  );
};

export default ResourceMetrics;
