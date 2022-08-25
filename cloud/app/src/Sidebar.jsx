import React, { useContext, useEffect, useState } from 'react';

import { Link, useLocation } from "react-router-dom";
import { Navbar, Button, Nav, NavDropdown, Dropdown, NavItem } from 'react-bootstrap';
// import { useAccount } from './hooks';
import _ from "lodash";
import {Login, UserContext} from './Login.jsx';

const F = React.Fragment;

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    color: '#bbb'
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
  },
  pageLink: {
    background: '#4444',
    // lineHeight: '2em',
    margin: '0.2em 0 0.2em 0',
    // padding: '.25em 0.25em .25em 1em',
    borderRadius: '1.25em 0 0 1.25em',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  pageLinkActive: {
    background: 'linear-gradient(45deg, #23559c25, #18901335)',
    color: '#fff',
    fontWeight: 'bold'
  },
  loggedIn: {
    paddingRight: '1em'
  },
  link: {
    color: 'inherit'
  },
  scope: {
    marginTop: '1em'
  }
};


const PageLink = ({to, children}) => {
  const location = useLocation();
  const style = Object.assign({}, styles.pageLink);
  location.pathname == to && Object.assign(style, styles.pageLinkActive);

  // <Button as={Link} to={to} style={style}>
  //   {children}
  // </Button>
  return <div className='d-grid'>
    <Nav.Item style={style}>
      <Nav.Link as={Link} to={to} style={styles.link}>
        {children}
      </Nav.Link>
    </Nav.Item>
  </div>;
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
    <div style={styles.loggedIn}>
      Logged in as {session.user}
      <Link onClick={logout} to='#' style={{
        float: 'right'
      }}>logout</Link>
    </div>
    <div>
      <PageLink to='/security'>Security</PageLink>
      <a href='https://portal.transitiverobotics.com/billing/v1/billingPortal'>
        Billing
      </a>
    </div>
  </div>;


  /** List links to the fleet views of other running packages */
  const OtherFleetCaps = () => {
    return _.map(runningPackages, (capNames, scope) =>
      <div key={scope} style={styles.scope}>
        {scope}:
        <div style={styles.subsection}>
          {_.map(capNames, (version, name) => <div key={name}>
            <PageLink to={`/fleet/${scope}/${name}`} title={version}>
              {name}
            </PageLink>
          </div>)}
        </div>
      </div>
    );
  };

  return <div style={styles.wrapper} className='sidebar'>
    <div style={styles.brand}>
      <a href={location.origin.replace('portal.', '')}>
        <img src='/logo.svg' title='Transitive Robotics' style={styles.logo} />
      </a>
      portal
    </div>

    <div style={styles.views}>
      <h5>Fleet Widgets</h5>
      <PageLink to='/'>General</PageLink>
      <OtherFleetCaps />
    </div>

    <div>
      { isLoggedIn ?
        <UserMenu />
        :
        <PageLink to="/login">Login</PageLink>
      }
    </div>
  </div>;
};
