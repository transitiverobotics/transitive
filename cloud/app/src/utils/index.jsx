import React, {forwardRef} from 'react';

/** A link (anchor) that can be used as a button */
export const ActionLink = forwardRef((props, ref) => {
  const {onClick, onContextMenu, disabled, children} = props;

  const style = {
    // verticalAlign: 'middle',
    // padding: '12px',
  };
  disabled && Object.assign(style, {
    opacity: '0.5'
  });

  return <a href={disabled ? null : '#'} ref={ref}
    className='btn btn-link'
    style={style}
    onClick={(e) => {
      e.preventDefault();
      onClick();
      return false;
    }}
    onContextMenu={(e) => {
      e.preventDefault();
      console.log('onContextMenu', onContextMenu);
      onContextMenu?.();
      return false;
    }}
    >{children}</a>;
});