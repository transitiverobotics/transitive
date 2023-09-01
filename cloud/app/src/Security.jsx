import React, { useEffect, useState, useContext } from 'react';
import { Form, Row, Col, ListGroup } from 'react-bootstrap';
import { FaTrashAlt } from 'react-icons/fa';

import _ from 'lodash';

import { getLogger, fetchJson } from '@transitive-sdk/utils-web';
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

  useEffect(() => {
      session && fetchJson('/@transitive-robotics/_robot-agent/security',
        (err, res) => err ? log.error(err) : setAccount(res));
    }, [session, forceUpdate]);

  const removeToken = (name) => {
    log.debug('removeToken', name);
    fetchJson(`/@transitive-robotics/_robot-agent/capsToken/${name}`,
      (err, res) => err ? log.error(err) : setForceUpdate(f => f + 1),
      {method: 'delete'});
  };

  if (!account) {
    return <div>Fetching data..</div>;
  }

  console.log(account);

  return <div style={styles.wrapper}>
    <h2>Security</h2>
    <Form.Text>
    </Form.Text>

    <hr/>

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

    <h5>Link Sharing</h5>
    <Form.Text>
      These are the links you've created for sharing capabilities on
      standalone pages. You can revoke these links here.
    </Form.Text>

    <CapTokens tokens={account.capTokens} removeToken={removeToken}
      session={session}/>

  </div>;
};
