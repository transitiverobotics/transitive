import React from 'react';
import { Sparklines, SparklinesLine, SparklinesReferenceLine } from 'react-sparklines';
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
  noData: {
    fontSize: '0.8em',
    color: '#6c757d',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '1em',
  },
};


/** Format number as percentage */
const formatPercentage = (x) => `${x.toFixed(1)}%`;

/** Draw a Sparkline with the given data and color, applying our common style */
const Chart = ({label, data, color}) =>
  <div title={`${label} usage over the last minute`}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5em',
      fontSize: '0.8em',
      color: color,
      maxWidth: '15em',
    }}>

    <span style={{
      fontSize: '0.75em',
      fontWeight: 'bold',
      padding: '2px 4px',
      borderRadius: '3px',
      textAlign: 'center',
    }}>
      {`${label}: ${formatPercentage(data.at(-1) || 0)}`}
    </span><div style={{
      margin: 0,
      flex: 1,
      maxWidth: '8em',
      backgroundColor: `${color}40` // semi-transparent
    }}>
      <Sparklines data={data} height={20} width={80} margin={2} max={100} min={0}>
        <SparklinesLine color={color} style={{ strokeWidth: 1.5 }} />
        <SparklinesReferenceLine type="mean"
          style={{
            stroke: color,
            strokeOpacity: 0.3,
            strokeDasharray: '1,1'
          }} />
      </Sparklines>
    </div>
  </div>;


/** Component to display resource metrics for CPU and Memory usage */
const ResourceMetrics = ({ metrics }) => metrics?.cpu ?
  // show metric when available
  <div style={styles.metricsContainer}>
    <Chart label='CPU' data={metrics.cpu || []} color='#3498db'/>
    {metrics.system && (
      <F>
        System:<br/>
        <Chart label='CPU' data={metrics.system.cpu || []} color='#9b59b6' />
        <Chart label='Memory' data={metrics.system.memory || []} color='#f39c12' />
      </F>
    )}
  </div>
  // else:
  : <div style={styles.noData}>
    No metrics data available yet
  </div>;


export default ResourceMetrics;
