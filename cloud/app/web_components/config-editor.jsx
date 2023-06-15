import React, { useState, useEffect } from 'react';

import { Col, Row, Form, Button } from 'react-bootstrap';

const _ = {
  map: require('lodash/map'),
  some: require('lodash/some'),
  forEach: require('lodash/forEach'),
  keyBy: require('lodash/keyBy'),
  filter: require('lodash/filter'),
  isEqual: require('lodash/isEqual'),
};

import { constants, getLogger } from '@transitive-sdk/utils-web';
const log = getLogger('ConfigEditor');
log.setLevel('debug');

const styles = {
  rows: {
    marginBottom: '0.5em'
  }
};

/** Configuration management widget
 * For now just for enabling ROS releases.
*/
export const ConfigEditor = ({config = {}, updateConfig}) => {

  const {rosReleases} = constants;
  const activeReleases = {1: null, 2: null};
  config.global?.rosReleases?.forEach(r =>
    activeReleases[rosReleases[r].rosVersion || 1] = r);
  const [selected, setSelected] = useState(activeReleases);

  const getReleasesForVersion = (version) => Object.keys(rosReleases)
      .filter(release => rosReleases[release].rosVersion == version);

  return <div>
    <Row>
      {[1, 2].map(version => {
        const releases = getReleasesForVersion(version).sort();

        return <Row key={version} style={styles.rows}>
          <Form.Label column='sm' sm={4}>ROS {version} release to use</Form.Label>
          <Col sm={5}>
            <Form.Select aria-label="Select ROS release to use"
              value={selected[version] || ''}
              onChange={e => setSelected(s => {
                return {...s, [version]: e.target.value};
              })}
            >
              <option value={''}>-- disable --</option>
              {releases.map(release => <option value={release} key={release}>
                {release} {activeReleases[version] == release && '(active)'}
              </option>)}
            </Form.Select>
          </Col>
        </Row>;
      })}
    </Row>
    <Button
      disabled={_.isEqual(selected, activeReleases)}
      onClick={() => updateConfig({
        'global.rosReleases': Object.values(selected).filter(Boolean)
    })}>
      Apply
    </Button>
  </div>
};
