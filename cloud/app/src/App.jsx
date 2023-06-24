import React, { useState, useEffect, useContext, useRef } from 'react';

import {BrowserRouter as Router, Routes, Route, Link, useParams} from
  'react-router-dom';
import _ from 'lodash';
import { Alert } from 'react-bootstrap';

import {getLogger, fetchJson} from '@transitive-sdk/utils-web';

import {Login, UserContext, UserContextProvider} from './Login.jsx';
import {Sidebar} from './Sidebar.jsx';
import {Security} from './Security.jsx';
import {StandAloneComponent} from './StandAloneComponent.jsx';
import {Embed} from './utils/Embed.jsx';
import { scheme1, grays } from './utils/colors';
import { ensureWebComponentIsLoaded } from './utils/utils';

const log = getLogger('App.jsx');
log.setLevel('debug');
// log.setLevel('info');

const F = React.Fragment;

const styles = {
  wrapper: {
    width: '100%',
    height: '100%',
    margin: '0px',
    display: 'flex',
  },
  sidebar: {
    margin: '0',
    padding: '1em 0 0 1em',
    flex: '1 0 10rem',
    // background: 'linear-gradient(-90deg, #000, #012)',
    background: '#1c1c20',
    color: '#fff',
    borderRight: `1px solid ${grays[12]}`,
    position: 'relative',
    height: '100vh',
    fontSize: 'small',
    paddingBottom: '2em',
  },
  body: {
    margin: '0',
    flex: '10 1 20em',
    padding: '2em',
    height: '100vh',
    overflow: 'auto',
    background: '#eee',
  },
  cap: {
    wrapper: {
      background: '#fff',
      borderRadius: '6px',
      padding: '1em',
    },
    embed: {
      float: 'right'
    },
    body: {
      padding: '1em'
    }
  },
  capName: {
    float: 'right',
  },
  additional: {
    marginTop: '2em'
  }
};

/** Note, this only works on the cloud app directly when we are logged in with
    username/password, which allows us to get JWTs. This is not a model of
  how to do this with capabilities in other web applications */
const Capability = ({webComponent, capability, simple, jwtExtras = {}, ...props}) => {
  const {session, logout} = useContext(UserContext);
  const [jwtToken, setJwtToken] = useState();
  const {deviceId = '_fleet'} = useParams();
  const ref = useRef(null);
  const [error, setError] = useState();

  log.debug('Capability', {deviceId, webComponent, capability, props, session});
  ensureWebComponentIsLoaded(capability, webComponent, session && session.user, deviceId);

  useEffect(() => {
      if (session) {
        fetchJson('/@transitive-robotics/_robot-agent/getJWT',
          (err, res) => {
            if (err) {
              log.error(err, res);
              // logout();
              res?.error && setError(res.error);
            } else {
              setJwtToken(res.token);
            }
          },
          {body: {
            id: session.user,
            device: deviceId,
            capability,
            validity: 3600 * 24,
            ...jwtExtras
          }});
        // We need to delete jwt at the end, otherwise using this Component with
        // another capability will reuse the existing jwt at first
        return () => setJwtToken(null);
      }
    }, [webComponent, capability, session, deviceId]);

  if (error) {
    return <Alert variant='warning'>{error}</Alert>;
  }

  if (!session) {
    // shouldn't happen but just in case
    return <div>Log in to see device details</div>;
  }

  if (!jwtToken) {
    return <div>Authenticating...</div>;
  }

  const ssl = (location.protocol == 'https:');

  const element = React.createElement(webComponent, {
      jwt: jwtToken,
      id: session.user,
      host: TR_HOST,
      ssl,
      ref,
      ...session,
      ...props,
    }, null);

  if (simple) {
    return element;
  }

  return <div className='capability' style={styles.cap.wrapper}>
    <div style={styles.cap.embed}>
      <Embed jwt={jwtToken} name={webComponent} deviceId={deviceId}
        host={TR_HOST} ssl={ssl} compRef={ref} capability={capability} />
    </div>
    <div style={styles.cap.body}>
      {element}
    </div>
  </div>;
};


/** Component to render widgets of capabilities, indicated in URL params.
  type = device | fleet
*/
const CapabilityWidget = ({type}) => {
  const {deviceId, scope, capabilityName} = useParams();
  const {session} = useContext(UserContext);
  const capability = `${scope}/${capabilityName}`;
  const webComponent = `${capabilityName}-${type}`;
  const [pkg, setPkg] = useState({});

  const pkgUrl = session?.user &&
    `/running/${capability}/package.json?userId=${session.user}&deviceId=${deviceId || '_fleet'}`;
  /** TODO: Could we replace this^ with a call like
    fetch(`http://${REGISTRY_HOST}:6000/${encodeURIComponent(name)}`)).json();
    as in docker.js?
    or use `npm view`? https://docs.npmjs.com/cli/v7/commands/npm-view
  */

  // fetch info about additional widgets of this capability from it's
  // package.json
  useEffect(() => {
       pkgUrl && fetchJson(pkgUrl, (err, json) => {
        if (err) {
          log.debug(err);
          setPkg({});
        } else {
          log.debug('package.json', json?.transitiverobotics);
          setPkg(json?.transitiverobotics || {});
        }
      });
    }, [session, scope, capabilityName]);

  log.debug({scope, capability, pkg});

  return <div>
    {type == 'device' ?
      <Capability simple={true} webComponent='robot-agent-device-header'
        capability='@transitive-robotics/_robot-agent'/>
      : <div>Fleet</div>
    }
    <div>&nbsp;</div>

    <h4>{pkg?.title || capability}</h4>
    <Capability webComponent={webComponent} capability={capability}/>

    {pkg?.widgets && Object.keys(pkg.widgets).length > 0 && <div>
        <h6 style={styles.additional}>
          Additional widgets provided by this capability
        </h6>
        {_.map(pkg.widgets, (def, name) => <div key={name}>
            <h5>{def.title}</h5>
            <Capability webComponent={name}
              capability={capability}
              jwtExtras={def.topics ? {topics: def.topics} : {}}
              />
          </div>
        )}
      </div>
    }
  </div>;
};

const messages = {
  verificationSuccessful: 'Email verification successful!',
  notVerified: 'Welcome! Before you can proceed and add robots to your account, you need to verify your email address. Please check your email.'
};
const Message = ({msg}) => {
  const [show, setShow] = useState(true);
  const hide = () => setShow(false);

  useEffect(() => {
    history.replaceState({}, '', location.pathname);
  }, [msg]);

  return show && <Alert dismissible onClose={hide}>
    {messages[msg] || msg}
  </Alert>;
};

const Portal = () => {
  const {msg} = Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const {session} = useContext(UserContext);
  log.debug({session});

  return <div style={styles.wrapper}>
    <div style={styles.sidebar}>
      <Sidebar />
    </div>

    <div style={styles.body}>
      { msg && <Message msg={msg} /> }

      { session.verified ? <Routes>
          <Route path="/admin" />
          <Route path="/security" element={<Security />} />

          <Route path="/" element={
              <Capability webComponent='robot-agent-fleet'
                capability='@transitive-robotics/_robot-agent'
                device_url='/device'
                />
            }/>

          <Route path="/device/:deviceId" element={
              <Capability webComponent='robot-agent-device'
                capability='@transitive-robotics/_robot-agent'
                fleetURL='/'
                />
            }/>

          {/** per capability and per device page */}
          <Route path="/device/:deviceId/:scope/:capabilityName"
            element={<CapabilityWidget type='device'/>} />

          <Route path="/fleet/:scope/:capabilityName"
            element={<CapabilityWidget type='fleet'/>} />

        </Routes>
        :
        <Message msg='notVerified' />
      }
    </div>
  </div>;
};

const Apps = () => {

  const {ready, session, login, logout} = useContext(UserContext);

  if (!ready) return <div></div>;

  return <Router>
    <Routes>
      <Route path="/sac/:org/:device/:scope/:capName/:widget"
        element={<StandAloneComponent />} />

      <Route path="/register" element={<Login mode='register' />} />
      <Route path="/*" element={session ? <Portal /> : <Login />} />
    </Routes>
  </Router>;
};


export default () => {
  return <div>
    <UserContextProvider>
      <Apps />
    </UserContextProvider>
  </div>;
};
