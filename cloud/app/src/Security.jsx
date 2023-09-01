import React, {useEffect, useState, useContext} from 'react';
import { Form, Row, Col, ListGroup } from 'react-bootstrap';
import { FaTrashAlt } from 'react-icons/fa';

import _ from 'lodash';

import {getLogger, fetchJson} from '@transitive-sdk/utils-web';
import {UserContext} from './Login.jsx';
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
const CapTokens = ({tokens}) => {

  log.debug({tokens});

  return <ListGroup>
    {_.map(tokens, (obj, name) => <ListGroup.Item key={name}
        className="d-flex justify-content-between align-items-start"
      >
        <div className="ms-2 me-auto">
          <div className="fw-bold">{name}</div>
          <div>{obj.device}/{obj.capability}</div>
          {obj.config && <div>
            Config: <pre>{JSON.stringify(obj.config, true, 2)}</pre>
          </div>}
        </div>
        <button type="button" className="btn-close" aria-label="Close alert"
          style={{background: 'none', lineHeight: 0}}
        >
          <FaTrashAlt />
        </button>
      </ListGroup.Item>
    )}
  </ListGroup>;
};

export const Security = () => {
  const {session} = useContext(UserContext);
  const [account, setAccount] = useState();

  useEffect(() => {
      session && fetchJson('/@transitive-robotics/_robot-agent/security',
        (err, res) => err ? console.error(err) : setAccount(res));
    }, [session]);

  if (!account) {
    return <div>Fetching data..</div>;
  }

  console.log(account);

  return <div style={styles.wrapper}>
    <h2>Security</h2>
    <Form.Text>
    </Form.Text>

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

      <CapTokens tokens={account.capTokens}/>
    </Form.Group>
  </div>;
};
