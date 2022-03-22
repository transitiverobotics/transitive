function checkSuperuser(username) {
  var parts = username.split(':');
  var rtv = parts[0] == 'transitiverobotics';
  console.log('superuser', username, rtv);
  return rtv;
}

// console.log(JSON.stringify(this, true, 2));
checkSuperuser(username);
