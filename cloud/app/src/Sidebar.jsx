import React, { useContext } from 'react';

import { Link } from "react-router-dom";
import { Navbar, Button, Nav, NavDropdown, Dropdown, NavItem } from 'react-bootstrap';
// import { useAccount } from './hooks';
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
  }
};


/** The sidebar */
export const Sidebar = () => {
  // const { user, isLoggedIn, email } = useAccount();
  const {user, logout} = useContext(UserContext);
  const isLoggedIn = !!user;

  // const deimpersonate = () => {
  //   localStorage.originalLoginToken &&
  //     Accounts.loginWithToken(localStorage.originalLoginToken);
  //   delete localStorage.originalLoginToken;
  // };

  const UserMenu = () => <div>
    <div>
      Logged in as {user}
    </div>
    <div>
      <Link to='/security'>Security</Link>
    </div>
    <div>
      <Link onClick={logout} to='#'>Logout</Link>
    </div>
  </div>;

  return <div style={styles.wrapper}>
    <Link to="/" style={styles.brand}>
      <img src='/logo.svg' title='Transitive Robotics' style={styles.logo} />
      Portal
    </Link>

    <div style={styles.views}>
      <h4>Views</h4>
      <Link to='/'>General</Link>

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
