import React, { useState, useEffect, useContext } from 'react';

import { Col, Row, Form, Badge, Toast } from 'react-bootstrap';
import DataTable, { createTheme } from 'react-data-table-component';
import { FaRegCreditCard, FaExclamationTriangle } from 'react-icons/fa';
import { PiUserSwitch } from 'react-icons/pi';
import _ from 'lodash';

import { getLogger, fetchJson } from '@transitive-sdk/utils-web';

import { ActionLink } from './utils/index';
import { UserContext } from './Login.jsx';
import { heartbeatLevel, Heartbeat } from '../web_components/shared';

const log = getLogger('Admin.jsx');
log.setLevel('debug');

const styles = {
  user: {
    display: 'flex',
    // justifyContent: 'space-between',
    width: '100%',
    alignItems: 'center'
  },
  toast: {
    position: 'absolute',
    top: '1em',
    right: '1em',
  },
  warning: {
    color: '#b00',
    marginLeft: '0.25em'
  }
}


// Create custom DataTable theme from bootstrap CSS variables (so it works for
// both light and dark mode).
createTheme('bootstrap',
  {
    text: {
      primary: 'var(--bs-body-color)',
      secondary: 'var(--bs-secondary-color)',
    },
    background: {
      default: 'var(--bs-body-bg)',
    },
    context: {
      background: 'var(--bs-info-bg-subtle)',
    },
  },
  'dark',
);

const MyToast = ({text, close}) =>
  <Toast delay={3000} autohide style={styles.toast}
    onClose={close}
    show={Boolean(text)} >
    <Toast.Header>
      <strong className="me-auto">Note</strong>
      {/* <small>11 mins ago</small> */}
    </Toast.Header>
    <Toast.Body>{text}</Toast.Body>
  </Toast>;



/** aggregate heartbeats by status (0, 1 or 2). */
const aggregateHeartbeatsByStatus = (heartbeats) =>
  _.mapValues( heartbeats, (devices) =>
    _.reduce( devices, (agg, heartbeat, deviceId) => {
        // get status for this heartbeat
        const level = heartbeatLevel(heartbeat);
        // increase count of that category in agg
        agg[level] ||= {count: 0, latest: 0};
        agg[level].count++;
        agg[level].latest = Math.max(agg[level].latest, new Date(heartbeat));
        return agg;
      }, []));


/** Given an array of heartbeat levels, see aggregateHeartbeatsByStatus, return
* a scalar value for sorting */
const getHeartbeatSortValue = (heartbeats) => !heartbeats ? 0 :
  10000 * (heartbeats[0]?.count || 0)
    + 100 * (heartbeats[1]?.count || 0)
    + (heartbeats[2]?.count || 0);

const DeviceColumHeader = ({users}) => {
  const sum = (index) => users.reduce((sum, u) =>
    sum + (u.heartbeats[index]?.count || 0), 0);
  return <div>Devices<br/>{sum(0)}/{sum(1)}/{sum(2)}</div>;
}

/** can this account pay? */
const canPay = (account) =>
  account.stripeCustomer?.invoice_settings?.default_payment_method
    || account.stripeCustomer?.metadata?.collection_method == 'send_invoice';

export const Admin = () => {
  const [users, setUsers] = useState([]);
  const {impersonate} = useContext(UserContext);
  const [toast, setToast] = useState(null);

  useEffect(() => {
      fetchJson('/@transitive-robotics/_robot-agent/admin/getUsers', (err, res) => {
        if (err) {
          log.error(err, res);
        } else {
          const heartbeats = aggregateHeartbeatsByStatus(res.heartbeats);
          res.users.forEach(user => {
            user.heartbeats = heartbeats[user._id] || [];
          });
          setUsers(res.users);
        }
      });

  }, []);

  log.debug({users});

  const columns = [
    {
      width: '2.5em',
      style: {padding: '0.5em'},
      right: true,
      grow: 0,
      selector: (row, i) => i + 1,
    },
    { name: 'Name',
      grow: 5,
      selector: row => row._id,
      cell: row => <div style={styles.user}>
        <ActionLink onClick={() => {
          impersonate(row._id);
          setToast(`You are now ${row._id}`);
        }}>
          <PiUserSwitch title='impersonate'/>
        </ActionLink>
        <b>{row._id}</b>
        </div>,
      sortable: true,
    },
    {
      name: <DeviceColumHeader users={users} />,
      id: 'heartbeats',
      grow: 2,
      cell: row => <div>
        {row.heartbeats.map(({count, latest}, level) =>
          <span key={level}>
            {count} <Heartbeat heartbeat={latest} refresh={false} />
          </span>)}
      </div>,
      sortable: true,
      sortFunction: (a, b) => getHeartbeatSortValue(a.heartbeats) -
        getHeartbeatSortValue(b.heartbeats)
    },
    { name: 'Email',
      grow: 5,
      selector: row => row.verified
    },
    { name: 'Joined',
      grow: 4,
      cell: row => row.created ? (new Date(row.created)).toLocaleString() : '',
      sortable: true,
      sortFunction: (a, b) => !a.created ? -1 : (!b.created ? 1 :
        ((new Date(a.created)).getTime() - (new Date(b.created)).getTime()))
    },
    { name: 'Balance',
      grow: 1,
      cell: row => row.stripeCustomer?.balance &&
        `\$${row.stripeCustomer.balance / -100}`,
      sortable: true,
      sortFunction: (a, b) => (a.stripeCustomer?.balance ?? 1) -
        (b.stripeCustomer?.balance ?? 1)
    },
    { name: 'Free',
      grow: 1,
      cell: row => row.free && <Badge size='sm' bg='success'>free</Badge>,
      sortable: true,
      sortFunction: (a, b) => (a.free ? 1 : 0) - (b.free ? 1 : 0)
    },
    { /* Whether account has a payment method on file, and whether it is delinquent */
      name: 'Has card',
      grow: 1,
      cell: row => <span>
        {canPay(row) && <FaRegCreditCard />}
        {row.stripeCustomer?.delinquent &&
          <FaExclamationTriangle style={styles.warning} />}
      </span>,
      sortable: true,
      sortFunction: (a, b) => (canPay(a) ? 1 : 0) - (canPay(b) ? 1 : 0)
    },
  ];

  return <div><h2>Admin</h2>
    <MyToast text={toast} close={() => setToast(null)}/>

    <h4>Users</h4>
    {users && <Form.Text>{users.length} total</Form.Text>}

    <DataTable
      data={users}
      columns={columns}
      defaultSortFieldId={'heartbeats'}
      defaultSortAsc={false}
      dense
      theme='bootstrap'
      />
    </div>;
};