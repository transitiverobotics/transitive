import React, {forwardRef} from 'react';

/** A link (anchor) that can be used as a button */
export const ActionLink = forwardRef(({onClick, disabled, children}, ref) => {
  const style = {
  };
  disabled && Object.assign(style, {
    opacity: '0.5'
  });

  return <a href={disabled ? null : '#'} ref={ref}
    style={style}
    onClick={(e) => {
      e.preventDefault();
      onClick();
      return false;
    }}>{children}</a>;
});