import React, { useState, useEffect, useContext } from 'react';
import { Card, Button, Form } from 'react-bootstrap';

import { loglevel, getLogger, fetchJson, parseCookie }
from '@transitive-sdk/utils-web';

import { ActionLink } from './utils/index';

const { COOKIE_NAME } = require('../common.js');

const log = getLogger('Login');
log.setLevel('debug');
window.loglevel = loglevel;

const F = React.Fragment;

const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(21deg, rgb(0, 0, 0), #000, #112, #234)',
  },
  wrapper: {
    margin: 'auto',
    top: 'calc(50vh - 20em)',
    // left: 'calc(50vw - 15em)',
    padding: '2em',
    maxWidth: '30em',
    // height: '30em',
    // width: '30em'
    // marginTop: 'calc(50vh - 15em)'
  },
  loggedIn: {
    margin: 'auto'
  },
  error: {
    padding: '0.5em',
    color: '#b00',
  },
  conditions: {
    fontSize: 'smaller',
    color: '#444',
    marginTop: '2em',
    marginBottom: '2em'
  },
  forgotLink: {
    fontSize: 'smaller',
    marginTop: '1em'
  }
};

export const UserContext = React.createContext({});
export const UserContextProvider = ({children}) => {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState();
  const [error, setError] = useState();
  const refresh = () => {
    const cookie = parseCookie(document.cookie);
    // log.debug('cookie', cookie);
    cookie[COOKIE_NAME] &&
      setSession(JSON.parse(cookie[COOKIE_NAME]));
    setReady(true);
  };

  useEffect(() => {
      // refresh cookie
      fetchJson(`/@transitive-robotics/_robot-agent/refresh`, (err, res) => {
        !err && log.debug('refreshed');
        refresh();
      });
    }, []);

  /** execute the login */
  const login = (user, password) =>
    fetchJson(`/@transitive-robotics/_robot-agent/login`,
      (err, res) => {
        if (err) {
          log.error(err);
          setError('Failed to log in, please check your credentials.');
        } else {
          setError(null);
          log.debug('logged in');
          refresh();
        }
      },
      {body: {name: user, password}});

  const logout = () => fetchJson('/@transitive-robotics/_robot-agent/logout',
    (err, res) => {
      if (err) {
        log.error(err);
      } else {
        refresh();
        log.debug('logged out');
        location.href = '/';
      }
    },
    {method: 'post'});

  /** register new account */
  const register = (user, password, email) =>
    fetchJson(`/@transitive-robotics/_robot-agent/register`,
      (err, res) => {
        if (err) {
          log.error(err, res);
          setError(`Failed to register: ${res.error}`);
        } else {
          setError(null);
          log.debug('registered');
          refresh();
        }
      },
      {body: {name: user, password, email}});

  const forgot = (email) =>
    fetchJson(`/@transitive-robotics/_robot-agent/forgot`,
      (err, res) => {
        if (err) {
          log.error(err, res);
          setError(`Failed to request reset link: ${res.error}`);
        } else {
          setError(null);
          log.debug('reset link sent');
        }
      },
      {body: {email}});

  const reset = (user, password, code) =>
    fetchJson(`/@transitive-robotics/_robot-agent/reset`,
      (err, res) => {
        if (err) {
          log.error(err, res);
          setError(`Failed to reset password: ${res.error}`);
        } else {
          setError(null);
          log.debug('password reset');
          location.href = '/';
        }
      },
      {body: {name: user, password, code}});

  const impersonate = (_id) => {
    fetchJson(`/@transitive-robotics/_robot-agent/admin/impersonate`,
      (err, res) => {
        if (err) {
          log.error(err);
        } else {
          log.debug('impersonating', _id);
          refresh();
        }
      },
      {body: {name: _id}});
  };

  const deimpersonate = () => {
    fetchJson(`/@transitive-robotics/_robot-agent/admin/deimpersonate`,
      (err, res) => {
        if (err) {
          log.error(err);
        } else {
          log.debug('stopped impersonating');
          refresh();
        }
      });
  };

  return <UserContext.Provider
    value={{ ready, session, login, logout, register, forgot, reset,
      impersonate, deimpersonate, error }}>
    {children}
  </UserContext.Provider>;
};

/** Login component; updates the context on login/logout events */
export const Login = ({mode: presetMode = undefined}) => {


  const url = new URL(window.location);
  url.hostname = url.hostname.split('.').slice(-2).join('.');
  url.pathname = '/';
  const homepage = url.toString();

  const params = new URLSearchParams(location.search);

  const [userName, setUserName] =
    useState(presetMode == 'reset' ? params.get('id') : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const {session, login, logout, register, error, forgot, reset}
    = useContext(UserContext);

  const modes = {
    login: {
      title: 'Log In',
      submit: () => login(userName, password)
    },
    register: {
      title: 'Register',
      submit: () => register(userName, password, email)
    },
    forgot: {
      title: 'Forgot Login/Password',
      submit: async () => { await forgot(email); setMode('login'); }
    },
    reset: {
      title: 'Reset Password',
      submit: () => reset(userName, password, params.get('code'))
    },
  };

  const [mode, setMode] = useState(presetMode || 'login');
  const modeObj = modes[mode];
  // const [isRegister, setIsRegister] = useState(mode == 'register');
  const isRegister = mode == 'register';

  session && setTimeout(() => location.href = '/', 500);
  // const action = (isRegister ? 'Register' : 'Log in');

  // const submit = () => isRegister
  //   ? register(userName, password, email)
  // : login(userName, password);

  const formLoginRegister = <F>
    <Form.Group className='mb-3' controlId='formUsername'>
      <Form.Label>Username</Form.Label>
      <Form.Control type='text'
        placeholder={isRegister ? 'Lower case, ideally short' : 'Username'}
        value={userName} onChange={e => setUserName(e.target.value.toLowerCase())}
        autoComplete='username'
        required
        isInvalid={isRegister && userName.length > 0
          && !userName.match(/^[a-z]+[a-z0-9]*$/)}
        />
      <Form.Control.Feedback>Looks good!</Form.Control.Feedback>
    </Form.Group>

    {isRegister && <Form.Group className='mb-3' controlId='formBasicEmail'>
      <Form.Label>Email</Form.Label>
      <Form.Control type='email' placeholder='Email'
        value={email} onChange={e => setEmail(e.target.value)}
        required
        />
    </Form.Group>}

    <Form.Group className='mb-3' controlId='formBasicPassword'>
      <Form.Label>Password</Form.Label>
      <Form.Control type='password' placeholder='Password'
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        isInvalid={isRegister && password.length > 0 && password.length < 8}
        autoComplete={isRegister ? 'new-password' : 'current-password'}/>
    </Form.Group>

    {isRegister &&
        <Form.Group className='mb-3' controlId='formBasicPassword2'>
          <Form.Label>Repeat Password</Form.Label>
          <Form.Control type='password' placeholder='Password'
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            isInvalid={password2.length > 0 && password2 != password}
            autoComplete={isRegister ? 'new-password' : 'current-password'}/>
        </Form.Group>
    }

    <div style={styles.conditions}>
      By {isRegister ? 'registering' : 'logging in'} you agree to
      Transitive Robotics's <a
        href={`${homepage}terms`}>Terms of Service</a>, <a
        href={`${homepage}eula`}>EULA</a> and <a
        href={`${homepage}privacy`}>
        Privacy Policy</a>.
    </div>

    <Button variant='primary'
      disabled={isRegister
        ? (!userName || !userName.match(/^[a-z]+[a-z0-9]*$/) || !password ||
          !password2 || (password != password2) || !email ||
          !email.match(/.@..*\.[a-zA-Z]{2}/))
        : (!userName || !password)
      }
      type='submit'
    >
      {modeObj.title}
    </Button> &nbsp;<span> or {isRegister
        ? <ActionLink onClick={() => setMode('login')}>
          Log in
        </ActionLink>
        : <ActionLink onClick={() => setMode('register')}>
          Register
        </ActionLink>
      }
    </span>
    {error && <div style={styles.error}>{error}</div>}

    <div style={styles.forgotLink}>
      <ActionLink onClick={() => setMode('forgot')}>
        Forgot login/password
      </ActionLink>
    </div>
  </F>;

  /* Form to request a reset password link */
  const formForgot = <F>
    <Form.Group className='mb-3' controlId='formBasicEmail'>
      <Form.Label>Email</Form.Label>
      <Form.Control type='email' placeholder='Email'
        value={email} onChange={e => setEmail(e.target.value)}
        required
        />
    </Form.Group>

    <Button variant='primary'
      disabled={!email || !email.match(/.@..*\.[a-zA-Z]{2}/)}
      type='submit'
    >
      Send reset password link
    </Button> &nbsp;<span> or <ActionLink
        onClick={() => setMode('login')}>
        Log in
      </ActionLink>
    </span>
    {error && <div style={styles.error}>{error}</div>}
  </F>;

  /* Form for resetting password, rendered from link sent in formForgot */
  const formReset = <F>
    <Form.Group className='mb-3' controlId='formUsername'>
      <Form.Label>Username</Form.Label>
      <Form.Control type='text'
        value={userName}
        disabled={true}
        autoComplete='username'
        />
    </Form.Group>

    <Form.Group className='mb-3' controlId='formBasicPassword'>
      <Form.Label>Password</Form.Label>
      <Form.Control type='password' placeholder='New password'
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        isInvalid={password.length > 0 && password.length < 8}
        autoComplete={'new-password'}/>
    </Form.Group>

    <Form.Group className='mb-3' controlId='formBasicPassword2'>
      <Form.Label>Repeat Password</Form.Label>
      <Form.Control type='password' placeholder='New password'
        value={password2}
        onChange={e => setPassword2(e.target.value)}
        isInvalid={password2.length > 0 && password2 != password}
        autoComplete={'new-password'}/>
    </Form.Group>

    <Button variant='primary'
      disabled={!password || !password2 || (password != password2)}
      type='submit'
    >
      Set password
    </Button>
    {error && <div style={styles.error}>{error}</div>}
  </F>;

  const form = <Card.Body>
    <Card.Title>
      {modeObj.title}
    </Card.Title>

    <Form noValidate onSubmit={(e) => {
      e.stopPropagation();
      e.preventDefault();
      // submit();
      modeObj.submit();
    }}>
      {mode == 'forgot' ? formForgot :
        mode == 'reset' ? formReset : formLoginRegister}
    </Form>
  </Card.Body>;

  return <div style={styles.page}>
    <Card style={styles.wrapper}>
      <Card.Link href={homepage}>
        <Card.Img variant='top' src='/logo_text.svg' />
      </Card.Link>
      {session ?
        <div style={styles.loggedIn}>Logging in as {session.user}...</div> :
        form }
    </Card>
  </div>;
};
