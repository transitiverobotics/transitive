import React, { useState, useEffect, useContext } from 'react';

export const Delayed = ({delay = 500, children}) => {

  const [show, setShow] = useState(false);
  useEffect(() => setTimeout(() => setShow(true), delay), []);

  const style = {
    transition: 'opacity 1s ease, maxHeight 1s linear',
    opacity: show ? 1.0 : 0.0,
    maxHeight: show ? '1000px' : '0px'
  };

  return <div style={style}>{children}</div>;
};
