import React from 'react';

import { Button, OverlayTrigger, Popover } from 'react-bootstrap';
import { ActionLink } from './index.jsx';

const styles = {
  title: {
    fontSize: 'smaller',
    fontWeight: 'normal'
  },
  body: {
    fontSize: 'smaller'
  }
}

/** A reusable button that requires confirmation before executing onClick */
export const ConfirmedButton =
  ({style, variant, onClick, children, explanation, question, as, size}) => {
    const Comp = as || ActionLink;
    question ||= 'Are you sure?';

    return <OverlayTrigger trigger="click" placement="bottom" rootClose
      overlay={
        <Popover id="popover-positioned-bottom" title="">
          <Popover.Body style={styles.body}>
            { explanation && <div>{explanation}</div> }
            <strong>{question}</strong> <a onClick={onClick} href='#'>yes</a>
          </Popover.Body>
        </Popover>
      }
    >
      <Comp variant={variant || 'danger'} href='#' size={size}>
        {children}
      </Comp>
    </OverlayTrigger>;
  };
