import React, { useState } from 'react';

import { Form, InputGroup, FormControl, Button, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { FaCode } from 'react-icons/fa';
import _ from 'lodash';
import { getParameters } from "codesandbox/lib/api/define";

import {fetchJson, getLogger, decodeJWT} from '@transitive-sdk/utils-web';

import {Fold} from './Fold';
import {Code} from './Code';

const log = getLogger('Embed');
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
const EmbedBody = ({name, jwt, deviceId, extra={}, style, host, ssl, config = {}}) => {
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

  const defaultParams = `id="${id}" host="${host}" ssl="${ssl}"`;
  const paramString = formatParams({...extra, ...config});

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
      {body: {jwt, tokenName, password, config}});
  };

  const tryCode = `<script src="${bundleURL}"></script>\n<${name} ${defaultParams} jwt="${jwt}"${paramString}/>`;

  const parameters = getParameters({ files: {
    'package.json': { content: { dependencies: {} }},
    'index.html': { content: tryCode },
    'sandbox.config.json': { content: {
      "infiniteLoopProtection": true,
      "hardReloadOnChange": false,
      "view": "browser",
      "template": "static"
    }}
  }});

  const docs = new URL(window.location);
  docs.hostname = url.hostname.split('.').slice(-2).join('.');
  docs.pathname = '/docs/Hosted/embedding-in-react';
  docs.hash = '';

  return <div style={{color: 'inherit'}}>
    <p>
      You can embed this widget in other web pages or share it via a link.
    </p>

    <h6>Testing</h6>
    <form action="https://codesandbox.io/api/v1/sandboxes/define" method="POST"
      target="_blank">
      <input type="hidden" name="parameters" value={parameters} />
      <Button variant="primary" size='sm' onClick={(e) => {
        e.preventDefault();
        e.target.parentNode.submit();
        return false;
      }}>
        Try it in a CodeSandbox
      </Button><br/>
      This uses the following ready-to-go HTML snippet. The included <a
        href="https://jwt.io/">JWT token</a> is valid for the next 12 hours from when this page was loaded.
      <Code code={tryCode} />
    </form>

    <h6>Production</h6>
    In production, use the above HTML snippet, replacing the JWT with a new
    one signed with your JWT secret (see <Link to='/security'>Security</Link>),
    carrying the following payload:
    <Code code={['{',
          ..._.map(jwtPayloadExample, (value, key) => `  "${key}": "${value}",`),
          `  "userId": "user123", // a string that uniquely identifies a user in your context`,
          `  "validity": 86400, // number of seconds this authentication should remain valid`,
          '}'
        ].join('\n')} />

    When using React, see <a href={`${docs.toString()}`}>Embedding in React</a>.
    <br/><br/>

    <h6>Share</h6>

    <div>
      Alternatively, you can share this widget on a stand-alone,
      password-protected page. Set a name and password, then click "Get link".
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

export const Embed = ({style, compRef, capability, name, ...props}) => {
  const [show, setShow] = useState(false);
  const [config, setConfig] = useState(false);

  const open = () => {
    // get the config from the component for which we are showing embedding code
    const config = compRef.current.getConfig?.();
    config && setConfig(config);
    setShow(true);
  };

  return <div>
    <Button variant='link' onClick={open}>
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
        <EmbedBody name={name} {...props} config={config} />
        <Form.Text>
          capability: {capability}, widget: {name}
        </Form.Text>
      </Modal.Body>
    </Modal>
  </div>;
};