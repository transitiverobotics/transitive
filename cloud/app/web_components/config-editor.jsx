import React, { useState, useEffect } from 'react';

import { Col, Row, Form, Button, DropdownButton, Dropdown } from 'react-bootstrap';

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
export const ConfigEditor = ({info = {}, updateConfig}) => {

  const config = info.config;
  const installedReleases = info.rosReleases || [];
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
          <Col sm={4}>ROS {version} release to use</Col>
          <Col sm={5}>

            <DropdownButton title={selected[version] || 'none'} >
              <Dropdown.Item
                active={!activeReleases[version]}
                onClick={() => setSelected(s => ({...s, [version]: null}))}>
                none
              </Dropdown.Item>
              { releases.map(release => <Dropdown.Item key={release}
                  active={activeReleases[version] == release}
                  disabled={installedReleases.indexOf(release) == -1}
                  onClick={() => setSelected(s => ({...s, [version]: release}))}>
                  {release} {installedReleases.indexOf(release) == -1 &&
                    '(not installed)'}
                </Dropdown.Item>
              )}
            </DropdownButton>
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
