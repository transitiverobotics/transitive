import React, { useContext, useEffect, useState } from 'react';

import { Link, useLocation } from "react-router-dom";
import { Navbar, Button, Nav, NavDropdown, Dropdown, NavItem, Badge, Offcanvas }
  from 'react-bootstrap';
// import { useAccount } from './hooks';
import _ from "lodash";
import { FaBars, FaExclamationTriangle, FaRegCreditCard } from 'react-icons/fa';
import { Login, UserContext } from './Login.jsx';
import { ActionLink } from './utils/index';
// import { grays } from './utils/colors';
import { TransitiveLogo } from './TransitiveLogo.jsx';

const F = React.Fragment;

const darkMode = window.matchMedia('(prefers-color-scheme: dark)')?.matches;

const styles = {
  sidebar: {
    margin: '0',
    padding: '1em 0 0 1em',
    flex: '1 0 10rem',
    background: 'var(--bs-secondary-bg-subtle)',
    // borderRight: `1px solid ${grays[12]}`,
    position: 'relative',
    height: '100vh',
    fontSize: 'small',
    paddingBottom: '2em',
  },
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    color: 'var(--bs-body-color)'
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
    background: '#40404530',
    // lineHeight: '2em',
    margin: '0.2em 0.5em 0.2em 0',
    // padding: '.25em 0.25em .25em 1em',
    // borderRadius: '1.25em 0 0 1.25em',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  pageLinkActive: {
    background: '#404048a0',
    // background: 'linear-gradient(45deg, #23559c25, #18901335)',
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
  },
  checkmark: {
    color: '#1ec21e',
  },
  delinquent: {
    color: '#b00',
  },
  usermenu: {
    lineHeight: '2em',
  },
  hasTitle: {
    textDecoration: 'underline dotted #666',
  },
  section: {
    marginTop: '1em',
    fontWeight: 'bold'
  }
};


const PageLink = ({to, children}) => {
  const location = useLocation();
  const style = Object.assign({}, styles.pageLink);
  location.pathname == to && Object.assign(style, styles.pageLinkActive);

  // <Button as={Link} to={to} style={style}>
  //   {children}
  // </Button>
  return <div className='d-grid nav'>
    <Nav.Item style={style}>
      <Nav.Link as={Link} to={to} style={styles.link}>
        {children}
      </Nav.Link>
    </Nav.Item>
  </div>;
};

/** return human readable duration until given date */
const until = (date) => {
  const diff = new Date(date) - Date.now();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const minutes = Math.floor(diff / (60 * 1000));
  return (days >= 1
    ? `${days.toFixed(0)} day${days > 1 ? 's' : ''}`
    : ( hours >= 1
      ? `${hours.toFixed(0)} hour${hours > 1 ? 's' : ''}`
      : `${minutes.toFixed(0)} min${minutes > 1 ? 's' : ''}`
    )
  );
};

/** The sidebar */
export const Sidebar = () => {
  // const { user, isLoggedIn, email } = useAccount();
  const { session, logout, deimpersonate } = useContext(UserContext);
  const isLoggedIn = !!session;

  const [runningPackages, setRunningPackages] = useState({});
  const [show, setShow] = useState(false);

  const hideSidebar = () => setShow(false);
  const showSidebar = () => setShow(true);

  useEffect(hideSidebar, [useLocation().pathname]);

  useEffect(() => {
      fetch('/@transitive-robotics/_robot-agent/runningPackages').then(
        res => res.json()).then(running => {
          if (running.error) {
            console.log('error fetching running', running.error);
          } else {
            setRunningPackages(running);
          }
      });
    }, []);

  const billingHost = location.host.replace('portal.', 'billing.');

  const UserMenu = () => <div>
    <div style={styles.loggedIn}>
      Logged in as {session.user}
      <Link onClick={logout} to='#' style={{
        float: 'right'
      }}>log out</Link>
    </div>
    { session.admin && <div><Link to='/admin'>Admin</Link></div> }
    { session.impersonating && <div><ActionLink onClick={deimpersonate}>
          Stop impersonating</ActionLink></div> }
    <div style={styles.usermenu}>
      <div>
        <Link to='/security'>Security & Data usage</Link>
      </div>
      <div>
        <a href={`//${billingHost}/v1/billingPortal`}>
          Billing
        </a> {
          session.delinquent
          ? <span style={styles.delinquent}
            title="Failed payments. Please check your payment method."
          ><FaExclamationTriangle />
          </span>
          : session.has_payment_method
            && <span><span style={styles.checkmark}>✓</span> <FaRegCreditCard/></span>
        } {
          session.free && <Badge size='sm' bg='success'
            title='You are currently on our invite-only free plan'>
            free</Badge>
        }
      </div>
      { session.balance < 0 && <div>
          <Badge size='sm' bg='primary' title='Remaining starting credit'>
            ${(session.balance / -100).toFixed(2)}
          </Badge> {session.balanceExpires && <F>
            credit expires in <span style={styles.hasTitle}
              title={new Date(session.balanceExpires).toLocaleString()}>
              {until(session.balanceExpires)}
            </span></F>}
        </div>
      }
    </div>
  </div>;


  /** List links to the fleet views of other running packages */
  const OtherFleetCaps = () => {
    return _.map(runningPackages, (capNames, scope) =>
      <div key={scope} style={styles.scope}>
        {scope}
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

  const SidebarBody = () => <F>
    <div style={styles.views}>
      <PageLink to='/'>Devices</PageLink>
      <div style={styles.section}>Fleet Widgets</div>
      <OtherFleetCaps />
    </div>

    <div>
      { isLoggedIn ?
        <UserMenu />
        :
        <PageLink to="/login">Login</PageLink>
      }
    </div>
  </F>;

  return <F>
      {/* Desktop sidebar - hidden on small screens */}
      <div style={styles.sidebar} className="d-none d-lg-block">
        <div style={styles.wrapper} className='sidebar'>
          <TransitiveLogo />
          <SidebarBody />
        </div>
      </div>
      {/* Mobile toggle button - only visible on small screens */}
      {!show && <Button
          className="d-lg-none position-fixed top-0 start-0 m-3 shadow-sm"
          variant="dark"
          size="sm"
          onClick={showSidebar}
          aria-label="Open menu"
        >
          <FaBars />
        </Button>
      }
      {/* Mobile sidebar - offcanvas for small screens */}
      <Offcanvas
        data-bs-theme={darkMode ? 'dark' : 'light'}
        show={show}
        onHide={hideSidebar}
        className="d-lg-none bg-dark text-light"
        style={{ fontSize: 'small' }}
      >
        <Offcanvas.Body className="p-3">
           <div style={styles.wrapper} className='sidebar'>
            <Offcanvas.Header closeButton>
              <TransitiveLogo />
            </Offcanvas.Header>
            <SidebarBody />
          </div>
        </Offcanvas.Body>
      </Offcanvas>
    </F>;
}
