import React, {useEffect, useState, useContext} from 'react';
import { Form, Row, Col, Dropdown } from 'react-bootstrap';

import {getLogger, fetchJson} from '@transitive-sdk/utils-web';
import {UserContext} from './Login.jsx';
const log = getLogger('Security.jsx');

const styles = {
  wrapper: {
    width: '90%',
    margin: 'auto',
    marginTop: '2em'
  },
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
      fleet into your own web applications, we need to verify that your user is
      permitted to see your data for that capability. To do that, we use <a
      href="https://jwt.io/">JSON Web Tokens</a> (JWT).
    </Form.Text>

    <Form.Group as={Row} controlId="formPlaintextEmail">
      <Form.Label column sm="2">
        JWT secret
      </Form.Label>
      <Col sm="10">
        <Form.Control plaintext readOnly defaultValue={account.jwtSecret} />
      </Col>

      {/* TODO: list them and give options to delete them

        */ account.capTokens && <pre>
          {JSON.stringify(account.capTokens, true, 2)}
        </pre>}

    </Form.Group>

    <Dropdown.Divider />
  </div>;
};
