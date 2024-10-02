import React, { useEffect, useState, useContext, useCallback } from 'react';
import { Form, Row, Col, ListGroup } from 'react-bootstrap';
import { FaTrashAlt } from 'react-icons/fa';

import _ from 'lodash';

import { getLogger, fetchJson, formatBytes } from '@transitive-sdk/utils-web';
import { ConfirmedButton } from './utils/ConfirmedButton';
import { UserContext } from './Login.jsx';

const log = getLogger('Security.jsx');
log.setLevel('debug');

const styles = {
  wrapper: {
    width: '90%',
    margin: 'auto',
    marginTop: '2em'
  },
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
