import React, { useState, useEffect, useContext } from 'react';

import { Col, Row, Form } from 'react-bootstrap';

import { getLogger, fetchJson } from '@transitive-sdk/utils-web';
import { ActionLink } from './utils/index';
import { UserContext } from './Login.jsx';

const log = getLogger('Admin.jsx');
log.setLevel('debug');

export const Admin = () => {
  const [users, setUsers] = useState([]);
  const {impersonate} = useContext(UserContext);

  useEffect(() => {
      fetchJson('/@transitive-robotics/_robot-agent/admin/getUsers', (err, res) => {
          if (err) {
            log.error(err, res);
          } else {
            setUsers(res.users);
          }
        });

  }, []);

  log.debug({users});

  return <div><h2>Admin</h2>
    <h4>Users</h4>
    {users && <Form.Text>{users.length} total</Form.Text>}

    { users?.map(({_id, verified, created, stripeCustomer}) => {
      const date = created && new Date(created);

      return <Row key={_id}>
        <Col sm={1} style={{fontWeight: 'bold'}}>{_id}</Col>
        <Col sm={1}>
          <ActionLink onClick={() => impersonate(_id)}>
            impersonate
          </ActionLink>
        </Col>
        <Col sm={2}>{verified}</Col>
        <Col sm={2}>{date?.toLocaleString()}</Col>
        <Col sm={1}>{stripeCustomer && `\$${stripeCustomer.balance / -100}`}</Col>
      </Row>;
    })}
    </div>;
};