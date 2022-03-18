import React, { useContext, useEffect, useState } from 'react';

import { Link } from "react-router-dom";
import { Navbar, Button, Nav, NavDropdown, Dropdown, NavItem } from 'react-bootstrap';
// import { useAccount } from './hooks';
import _ from "lodash";
import {Login, UserContext, UserContextProvider} from './Login.jsx';

const F = React.Fragment;

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
  },
  logo: {
    height: '1.2em',
    marginRight: '0.3em',
    verticalAlign: 'top',
    display: 'inline-block'
  },
  brand: {
    color: 'inherit',
    textDecorations: 'none',
    textAlign: 'center',
  },
  views: {
    flexGrow: '1',
    marginTop: '3em',
    marginBottom: '3em',
  },
  subsection: {
    marginLeft: '1em'
  }
};

/** The sidebar */
export const Sidebar = () => {
  // const { user, isLoggedIn, email } = useAccount();
  const {session, logout} = useContext(UserContext);
  const isLoggedIn = !!session;

  const [runningPackages, setRunningPackages] = useState({});
  useEffect(() => {
      fetch('/@transitive-robotics/_robot-agent/runningPackages').then(
        res => res.json()).then(running => {
        console.log({running});
        setRunningPackages(running);
      });
    }, []);

  // const deimpersonate = () => {
  //   localStorage.originalLoginToken &&
  //     Accounts.loginWithToken(localStorage.originalLoginToken);
  //   delete localStorage.originalLoginToken;
  // };

  const UserMenu = () => <div>
    <div>
      Logged in as {session.user}
    </div>
    <div>
      <Link to='/security'>Security</Link>
    </div>
    <div>
      <Link onClick={logout} to='#'>Logout</Link>
    </div>
  </div>;

  /** List links to the fleet views of other running packages */
  const OtherFleetCaps = () => {
    const list = _.uniq(Object.keys(runningPackages)).map(name => name
      .match(/(?<scope>[^\/]*)\/(?<name>[^\/@]*)@(?<version>.*)/)
      .groups);
    const byScope = _.groupBy(list, 'scope');
    console.log({byScope});

    return _.map(byScope, (sublist, scope) =>
      <div key={scope}>
        <h6>{scope}</h6>
        <div style={styles.subsection}>
          {_.map(_.groupBy(
                _.filter(sublist, ({name}) => !name.startsWith('_')),
                'name'),
              (versions, name) =>
              <div key={name}>
                <Link to={`/fleet/${scope}/${name}`}>
                  {name}
                </Link>
                {/* if necessary, we can show the running versions
                  ({versions.map(({version}) => version).join(', ')}) */}
              </div>)
          }
        </div>
      </div>
    );
  };

  return <div style={styles.wrapper}>
    <Link to="/" style={styles.brand}>
      <img src='/logo.svg' title='Transitive Robotics' style={styles.logo} />
      portal
    </Link>

    <div style={styles.views}>
      <h5>Fleet Widgets</h5>
      <Link to='/'>General</Link>
      <OtherFleetCaps />
    </div>

    <div>
      { isLoggedIn ?
        <UserMenu />
        :
        <Link to="/login">Login</Link>
      }
    </div>
  </div>;
};
