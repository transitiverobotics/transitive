import React from 'react';
import { Sparklines, SparklinesLine, SparklinesReferenceLine } from 'react-sparklines';
import { getLogger } from '@transitive-sdk/utils-web';

const log = getLogger('resource-metrics');
log.setLevel('debug');

const F = React.Fragment;


/** Format number as percentage */
const formatPercentage = (x) => `${x.toFixed(1)}%`;

/** Draw a Sparkline with the given data and color, applying our common style */
const ResourceMetrics = ({label, data, color, title}) => {

  const styles = {
    metricsContainer: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.5em',
      fontSize: '0.7em',
      color: color,
      width: '12em',
      marginRight: '1em'
    },
    chart: {
      margin: 0,
      flex: 1,
      maxWidth: '8em',
      backgroundColor: `${color}20` // semi-transparent
    },
    referenceLine: {
      stroke: color,
      strokeOpacity: 0.3,
      strokeDasharray: '1,1'
    },
  };


  if (!data || data.length == 0) {
    return null;
  }

  return <div title={`${title} over the last minute`} style={styles.metricsContainer}>
    <span style={{ fontWeight: 'bold' }}>
      {`${label}: ${formatPercentage(data.at(-1) || 0)}`}
    </span>

    <span style={styles.chart}>
      <Sparklines data={data} height={20} width={80} margin={2} max={100} min={0}>
        <SparklinesLine color={color} style={{ strokeWidth: 1.5 }} />
        <SparklinesReferenceLine type="mean" style={styles.referenceLine} />
      </Sparklines>
    </span>
  </div>;
};

export default ResourceMetrics;
