import React, { useState } from 'react';

import { Form, InputGroup, FormControl, Button, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaCode } from 'react-icons/fa';
import _ from 'lodash';

import {fetchJson, getLogger, decodeJWT} from '@transitive-sdk/utils-web';

import {Fold} from './Fold';
import {Code} from './Code';

const log = getLogger('webrtc-video');
log.setLevel('debug');

const styles = {
  form: {maxWidth: '40em'},
  modalBody: {},
  icon: {
    transform: 'translateY(-1px)',
  },
};

/** format the given parameters for the html snippet to show */
const formatParams = (params) => _
    .map(params, (value, key) => `${key}=${JSON.stringify(value)}`)
    .sort()
    .map(s => `\n  ${s}`)
    .join('');

/** reusable embedding instructions */
const EmbedBody = ({name, jwt, deviceId, extra={}, style, host, ssl, added = {}}) => {
  if (!jwt) {
    return <span></span>;
  }

  const [tokenName, setTokenName] = useState('');
  const [password, setPassword] = useState('');
  const [link, setLink] = useState();

  const jwtPayload = decodeJWT(jwt);
  const url = new URL(location.href);
  const id = jwtPayload.id;
  const urlParams = new URLSearchParams({userId: id, deviceId}).toString();
  const currentHost = `${url.protocol}//${url.host}`;
  const bundleURL = `${currentHost}/running/${jwtPayload.capability
    }/dist/${name}.js?${urlParams}`;
  const jwtPayloadExample = {...jwtPayload};
  delete jwtPayloadExample.userId;
  delete jwtPayloadExample.validity;
  delete jwtPayloadExample.iat;

  const defaultParams = `id=${id} host=${host} ssl=${ssl}`;
  const paramString = formatParams({...extra, ...added});

  const createToken = () => {
    log.debug({tokenName, password});
    fetchJson('/@transitive-robotics/_robot-agent/createCapsToken',
      (err, res) => {
        if (err) {
          alert(err);
        } else {
          setLink(`${currentHost}/sac/${id}/${deviceId}/${jwtPayload.capability}/${name}?token=${tokenName}`);
        }
      },
      {body: {jwt, tokenName, password}});
  };

  return <div style={{color: 'inherit'}}>
    To embed this widget in another page use:
    <Code >
      {`<script src="${bundleURL}"></script>\n<${name} ${defaultParams} jwt="[JWT]"${paramString} />`}
    </Code>
    where <tt>JWT</tt> is a <a href="https://jwt.io/">JWT token</a> signed
    with your JWT secret (see <Link to='/security'>Security</Link>), carrying
    the payload:
    <Code>
      {['{',
          ..._.map(jwtPayloadExample, (value, key) => `  "${key}": "${value}"`),
          `  "userId": "[a string that uniquely identifies the current user]"`,
          `  "validity": [number of seconds this authentication should remain valid]`,
          '}'
        ].join('\n')}
    </Code>

    <div>
      For testing only you can use this ready-to-go snippet. The included JWT
      is valid for the next 12 hours from when this page was loaded.
      <Code>
        {`<script src="${bundleURL}"></script>\n<${name} ${defaultParams}\njwt="${jwt}"${paramString}/>`}
      </Code>
    </div>

    <hr/>

    <div>
      You can also share this widget on a stand-alone, password-protected page.
      To do that, set a name and password, then click "Get link".
      <Form action="#" onSubmit={(e) => {
        e.stopPropagation();
        e.preventDefault();
        createToken();
      }}>

        <InputGroup className="mb-3" size="sm" style={styles.form}>
          <FormControl
            placeholder="Name"
            aria-label="Name"
            value={tokenName}
            autoComplete="username"
            onChange={e => setTokenName(e.target.value)}
            />
          <FormControl
            type="password"
            placeholder="Set password"
            autoComplete="new-password"
            aria-label="Set password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            />
          <Button variant="secondary" id="b-addon2" onClick={createToken}>
            Get link
          </Button>
        </InputGroup>
        {link && <a href={link}>Link</a>}
      </Form>
    </div>
  </div>;
};

// export const Embed = ({style, ...props}) =>
//   <Fold title='Embedding instructions' style={style}>
//     <EmbedBody {...props} />
//   </Fold>;

export const Embed = ({style, ...props}) => {
  const [show, setShow] = useState(false);
  return <div>
    <Button variant='link' onClick={() => setShow(true)}>
      <FaCode style={styles.icon}/> Embed
    </Button>
    <Modal show={show} size="lg" centered aria-labelledby="embedding code"
      onHide={() => setShow(false)} >
      <Modal.Header closeButton>
        <Modal.Title>
          Embedding Instructions
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={styles.modalBody}>
        <EmbedBody {...props} />
      </Modal.Body>
    </Modal>
  </div>;
};