import React, { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import _ from 'lodash';

import { getLogger } from '@transitive-sdk/utils-web';
const log = getLogger('SelfChecks');
log.setLevel('info');

const F = React.Fragment;

const styles = {
  error: {
    marginBottom: '2em',
  }
};

/** UI component to show the results of the robot's self-checks. See
 * issues#400 */
const SelfCheck = ({ data, agentPrefix }) => {

  const failedChecks = data?.status?.selfCheckErrors;

  if (failedChecks && Object.keys(failedChecks).length > 0) {
    log.info('Self-check errors:', failedChecks);

    return (
      <div style={styles.error}>
        <Alert variant="danger">
          <strong>Some self-checks failed</strong>
          <ul>
            {_.map(failedChecks, (error, name) => <li key={name}>{error}</li>)}
          </ul>
        </Alert>
      </div>
    );
  } else {
    return (
      <F></F>
    );
  }

};

export default SelfCheck;
