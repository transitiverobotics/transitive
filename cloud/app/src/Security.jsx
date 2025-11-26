import React, { useEffect, useState, useContext, useCallback } from 'react';
import { Form, Row, Col, ListGroup, Button, Alert, Modal } from 'react-bootstrap';
import { FaTrashAlt, FaRegCopy, FaRegEye, FaRegEyeSlash } from 'react-icons/fa';

import _ from 'lodash';

import { getLogger, fetchJson, formatBytes } from '@transitive-sdk/utils-web';
import { ConfirmedButton } from './utils/ConfirmedButton';
import { UserContext } from './Login.jsx';

const log = getLogger('Security.jsx');
log.setLevel('debug');

const F = React.Fragment;

const styles = {
  wrapper: {
    width: '90%',
    margin: 'auto',
    marginTop: '2em'
  },
};

/** Component for changing passwords in a dialog */
const PasswordChangeDialog = ({ show, onHide, name, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Reset state when dialog opens
  useEffect(() => {
    if (show) {
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setSuccess('');
      setLoading(false);
    }
  }, [show]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newPassword) {
      setError('Password is required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await fetchJson(
        `/@transitive-robotics/_robot-agent/changeServicePassword/${name.toLowerCase()}`,
        (err, res) => {
          setLoading(false);
          if (err) {
            log.error(err);
            setError(err.error || 'Failed to change password');
          } else {
            setSuccess('Password changed successfully');
            setNewPassword('');
            setConfirmPassword('');
            onSuccess && onSuccess();
            // Close dialog after a short delay to show success message
            setTimeout(() => onHide(), 1500);
          }
        },
        { body: { newPassword } }
      );
    } catch (err) {
      setLoading(false);
      setError('Failed to change password');
      log.error(err);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Change {name} Password</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>New Password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              disabled={loading}
              autoFocus
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Confirm Password</Form.Label>
            <Form.Control
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={loading}
            />
          </Form.Group>

          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}

          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" onClick={onHide} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
};

/** Component for displaying a credential field with copy and show/hide password */
const CredentialField = ({ label, value, name, type = 'text' }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for older browsers or insecure contexts
        const textarea = document.createElement('textarea');
        textarea.value = value || '';
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Still show copied feedback even if it might have failed
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayValue = (type === 'password' && !showPassword)
    ? '•'.repeat(value?.length || 0)
    : value || 'Not configured';

  return (
    <Form.Group as={Row} controlId={`${name}-credential-${label}`}>
      <Form.Label column sm="2">
        {label}
      </Form.Label>
      <Col sm="10">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Form.Control
            plaintext
            readOnly
            value={displayValue}
            style={{ flex: 1, marginBottom: 0 }}
          />
          {type === 'password' && value && (
            <span
              style={{ cursor: 'pointer', fontSize: '1.2rem', color: '#6c757d' }}
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <FaRegEyeSlash /> : <FaRegEye />}
            </span>
          )}
          {value && (
            <span
              style={{ cursor: 'pointer', fontSize: '1.2rem', color: '#6c757d' }}
              onClick={handleCopy}
              title={copied ? 'Copied!' : 'Copy to clipboard'}
            >
              {copied ? '✓' : <FaRegCopy />}
            </span>
          )}
        </div>
      </Col>
    </Form.Group>
  );
};

/** list cap tokens and allow deleting them */
const CapTokens = ({tokens, removeToken, session}) => {

  log.debug({tokens, session});

  return <ListGroup>
    {_.map(tokens, (obj, name) => {
      const capName = obj.capability.split('/')[1];
      const widgetSuffix = obj.device == '_fleet' ? 'fleet' : 'device';
      const widget = `${capName}-${widgetSuffix}`;
      const path = `/sac/${session.user}/${obj.device}/${obj.capability}`;
      const link = `${path}/${widget}?token=${name}`;

      return <ListGroup.Item key={name}
        className="d-flex justify-content-between align-items-start"
      >
        <div className="ms-2 me-auto">
          <div className="fw-bold">
            <a href={link}>{name}</a></div>
          <div>{obj.device}/{obj.capability}</div>

          {obj.config && <div>
            Config: <pre>{JSON.stringify(obj.config, true, 2)}</pre>
          </div>}
        </div>
        {/* <button type="button" className="btn-close" aria-label="Close alert"
          style={{background: 'none', lineHeight: 0}}
          onClick={() => removeToken(name)}
        >
        </button> */}
        <ConfirmedButton
          question='Revoke this link?'
          onClick={() => removeToken(name)}>
          revoke
        </ConfirmedButton>
      </ListGroup.Item>;
    })}
  </ListGroup>;
};

/** Reusable component for showing credentrials */
const AccountCredentials = (props) => {

  const {credentials, name, description, setForceUpdate} = props;
  const [show, setShow] = useState(false);

  return <F>
    <h5>{name}</h5>

    <Form.Text>{description}</Form.Text>

    <Form.Group as={Row} controlId={`${name}-url`}>
      <Form.Label column sm="2">
        Dashboard
      </Form.Label>
      <Form.Label column sm="10">
        <a href={credentials.url} target="_blank" rel="noopener noreferrer">
          Open {name}
        </a>
      </Form.Label>
    </Form.Group>

    {credentials.email
      ? <CredentialField name={name} label="Email" value={credentials.email} type="text" />
      : <CredentialField name={name} label="Username" value={credentials.user} type="text" />
    }
    <CredentialField name={name} label="Password" value={credentials.password} type="password" />

    <Form.Group as={Row} className="mt-3">
      <Col sm={{ span: 10, offset: 2 }}>
        <Button variant="primary" size="sm" onClick={() => setShow(true)}>
          Change {name} Password
        </Button>
      </Col>
    </Form.Group>

    <PasswordChangeDialog
      show={show}
      name={name}
      onHide={() => setShow(false)}
      onSuccess={() => setForceUpdate(f => f + 1)}
      />

    <hr/>
  </F>;
}


/** The component rendering the security page of the user, showing the JWT secret
* and credentials for services included in the Transitive stack. */
export const Security = () => {
  const {session} = useContext(UserContext);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [account, setAccount] = useState();
  const [saved, setSaved] = useState(true);

  useEffect(() => {
      session && fetchJson('/@transitive-robotics/_robot-agent/security',
        (err, res) => err ? log.error(err) : setAccount(res));
    }, [session, forceUpdate]);

  const submit = useCallback(_.debounce((accountModifier) => {
        fetchJson(`/@transitive-robotics/_robot-agent/security`,
          (err, res) => {
            if (err) {
              log.error(err);
            } else {
              setSaved(true);
            }
          },
          { body: accountModifier });
    }, 500), []);

  useEffect(() => {
      setSaved(false);
      // account?.openId?.domain && account?.openId?.clientId &&
      account && submit({openId: account.openId});
    }, [account?.openId]);

  useEffect(() => {
      setSaved(false);
      // account?.googleDomain &&
      account && submit({googleDomain: account.googleDomain});
    }, [account?.googleDomain]);

  const removeToken = (name) => {
    log.debug('removeToken', name);
    fetchJson(`/@transitive-robotics/_robot-agent/capsToken/${name}`,
      (err, res) => err ? log.error(err) : setForceUpdate(f => f + 1),
      {method: 'delete'});
  };

  if (!account) {
    return <div>Fetching data..</div>;
  }

  return <div style={styles.wrapper}>
    <h2>Security</h2>

    <h5>Front-end</h5>

    <Form.Text>
      When you embed web components of the capabilities you installed on your
      fleet into your own web applications, we need to know that you permit your
      user to see your data for that capability and robot. You give us that
      permission by giving us a <a href="https://jwt.io/">JSON Web Tokens
      </a> (JWT) signed with your secret.
    </Form.Text>

    <Form.Group as={Row} controlId="formPlaintextEmail">
      <Form.Label column sm="2">
        JWT secret
      </Form.Label>
      <Col sm="10">
        <Form.Control plaintext readOnly defaultValue={account.jwtSecret} />
      </Col>
    </Form.Group>

    <hr/>


    <h5>Sign in with Google</h5>

    <Form.Text>
      Here you can associate a Google Workspace domain with your account. Anyone
      with an account on that workspace domain will be able to log into this
      account "{session.user}" on this portal.
    </Form.Text>

    <Form.Group as={Row} controlId="google-domain">
      <Form.Label column sm="2">
        Domain
      </Form.Label>
      <Col sm="10">
        <Form.Control value={account?.googleDomain || ''}
          onChange={(e) => setAccount(x => ({ ...x,
              googleDomain: e.target.value }))}
          placeholder='e.g., superbots.com'
          />
      </Col>
    </Form.Group>

    <hr/>

    <h5>OpenID Connect</h5>

    <Form.Text>
      Here you can specify an OpenID Connect application (e.g., Okta/Auth0
      applications) you want to grant access to your account. Anyone with access
      to that application will be able to log into this account "{session.user}"
      on this portal.
    </Form.Text>

    <Form.Group as={Row} controlId="openid-domain">
      <Form.Label column sm="2">
        Domain (URL)
      </Form.Label>
      <Col sm="10">
        <Form.Control value={account?.openId?.domain || ''}
          onChange={(e) => setAccount(x => ({ ...x,
            openId: { ...x.openId, domain: e.target.value }
          }))}
          placeholder='Enter the domain (URL) of your Open ID application'
          />
      </Col>
    </Form.Group>

    <Form.Group as={Row} controlId="openid-clientId">
      <Form.Label column sm="2">
        Client ID
      </Form.Label>
      <Col sm="10">
        <Form.Control value={account?.openId?.clientId || ''}
          onChange={(e) => setAccount(x => ({ ...x,
            openId: { ...x.openId, clientId: e.target.value }
          }))}
          placeholder='Enter the client ID of your Open ID application'
          />
      </Col>
    </Form.Group>

    <Form.Group as={Row} controlId="openid-domain">
      <Form.Label column sm="2">
        Callback URL
      </Form.Label>
      <Col sm="10">
        <tt>{
          `${location.origin}/@transitive-robotics/_robot-agent/openid/${session.user}/callback`
        }</tt><br/>
        <Form.Text>
          Please add this to the list of allowed callback URLs in your application.
        </Form.Text>
      </Col>
    </Form.Group>

    {account?.openId?.domain && account?.openId?.clientId && saved &&
      <Form.Group as={Row} controlId="openid-domain">
        <Form.Label column sm="2">
          Login Link
        </Form.Label>
        <Col sm="10">
          <a href={
            `${location.origin}/@transitive-robotics/_robot-agent/openid/${session.user}/login`
          }>OpenID Login to {session.user}</a><br/>
          <Form.Text>
            Share this link internally at your organization.
          </Form.Text>
        </Col>
      </Form.Group>}

    <hr/>


    {false && // hiding this for no wuntil we fix the team's display in hyperdx
        account?.hyperDXCredentials && <AccountCredentials
        name='HyperDX'
        description={<F>
          Your organization has access to HyperDX for logs and metrics observability.
          Use these credentials to log in to the HyperDX dashboard.
        </F>}
        credentials={account.hyperDXCredentials}
        setForceUpdate={setForceUpdate}
        />
    }

    {account?.clickhouseCredentials && <AccountCredentials
        name='ClickHouse'
        description={<F>
          Your organization has a dedicated ClickHouse user with access to your data.
          These credentials can be used to query your data directly via the ClickHouse API.
        </F>}
        credentials={account.clickhouseCredentials}
        setForceUpdate={setForceUpdate}
        />
    }

    <h5>Link Sharing</h5>
    <Form.Text>
      These are the links you've created for sharing capabilities on
      standalone pages. You can revoke these links here.
    </Form.Text>

    <CapTokens tokens={account.capTokens} removeToken={removeToken}
      session={session}/>

    <hr/>

    <h2>Monthly data usage</h2>

    <Form.Text>
      Shows the per-capability data usage for this calendar month (UTC).
      This gets updated once an hour. This does not include TURN data usage
      for WebRTC capabilities. For those, please see your Billing page.
    </Form.Text>

    {_.map(account.cap_usage, (bytes, capability) =>
      <Form.Group as={Row} key={capability}>
        <Form.Label column sm="2">
          {capability}
        </Form.Label>
        <Col sm="10">
          <Form.Control plaintext readOnly
            defaultValue={formatBytes(bytes)} />
        </Col>
      </Form.Group>
    )}


  </div>;
};
