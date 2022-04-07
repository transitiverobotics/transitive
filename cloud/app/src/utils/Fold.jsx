import React, { useState, useEffect, useContext } from 'react';

import { Accordion, AccordionContext, Button, Card } from 'react-bootstrap';
import { useAccordionButton } from 'react-bootstrap/AccordionButton';
import { FaChevronRight } from 'react-icons/fa';

const styles = {
  icon: {
    height: '0.8em',
    width: '0.8em',
    transition: 'transform 0.3s',
    verticalAlign: 'baseline',
  },
  body: {
    padding: '1em'
  }
}

const ContextAwareToggle = ({ children, eventKey, callback }) => {
  const { activeEventKey } = useContext(AccordionContext);
  const decoratedOnClick = useAccordionButton(
    eventKey,
    (e) => e.preventDefault() && callback && callback(eventKey),
  );
  const isCurrentEventKey = activeEventKey === eventKey;
  return <a onClick={decoratedOnClick} href=''>
    <FaChevronRight
      style={Object.assign(isCurrentEventKey ? {transform: 'rotate(90deg)'} : {},
        styles.icon)} /> {children}
  </a>;
};

/** A reusable folding component, title + body */
export const Fold = ({title, children, expanded, style}) =>
  <Accordion defaultActiveKey={expanded && '0'} style={style || {}}>
    <ContextAwareToggle eventKey="0">{title}</ContextAwareToggle>
    <Accordion.Collapse eventKey="0" style={styles.body}>
      {children}
    </Accordion.Collapse>
  </Accordion>;
