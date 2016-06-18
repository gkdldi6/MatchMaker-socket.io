var io = require('socket.io')(3000);

var users = [];
var rooms = [];

var rno = 0;
var waitroom = {
  roomno: 'waitroom',
  rname: '대기실'
};

// 소켓아이디, 회원아이디, 이름, 현재 방, 팀
function User(sid, uid, name, roomno) {
  this.sid = sid;
  this.uid = uid;
  this.name = name;
  this.roomno = roomno;
  this.team;
};

// 방번호, 방이름, 최대 유저수, 방에 있는 유저들
function Room(roomno, rname, usercnt, userid) {
  this.roomno = roomno;
  this.rname = rname;
  this.usercnt = usercnt;
  this.leader = userid;
  rno++;
};

// 선택한 방안에 있는 팀이름을 입력해서 그 안에 회원들의 배열을 반환
function usersWithTeam(users, team) {
  var tusers = new Array();
  for(i in users) {
    if(users[i].team === team) {
      tusers.push(users[i]);
    };
  };
  return tusers;
};



// 대기실에서 방으로, 방에서 대기실로 방 변경
function changeRoom(socket, exitroom, enterroom, user) {
  var users = usersInRoom(enterroom.roomno);
  var home = usersWithTeam(users, 'home');
  var away = usersWithTeam(users, 'away');

  socket.leave(exitroom.roomno);
  socket.join(enterroom.roomno);
  user.roomno = enterroom.roomno;

  socket.broadcast.in(exitroom.roomno).emit('exitroom', user);
  io.in(exitroom.roomno).emit('message', user.name + '(' + user.uid + ')' + '님이 ' + exitroom.rname + '을 나갔습니다.');
  io.in(enterroom.roomno).emit('message', user.name + '(' + user.uid + ')' + '님이 ' + enterroom.rname + '에 접속했습니다.');

  var rusers = usersInRoom(enterroom.roomno);
  if(enterroom.roomno === 'waitroom') {
    socket.broadcast.in(enterroom.roomno).emit('enterroom', user);
    socket.emit('userlist', rusers);
    return;
  }

  if(home.length === away.length) {
    user.team = 'home';
  } else if(home.length > away.length) {
    user.team = 'away';
  } else {
    user.team = 'home';
  }

  socket.broadcast.in(enterroom.roomno).emit('enterroom', user);
  socket.emit('userlist', rusers);
};

// 방번호로 들어가 있는 회원 목록 반환
function usersInRoom(roomno) {
  var rusers = new Array();

  for(i in users) {
    if(users[i].roomno == roomno) {
      rusers.push(users[i]);
    }
  }
  return rusers;
};

// 방번호로 방인덱스 구하기
function roomIndex(roomno) {
  for(i in rooms) {
    if(rooms[i].roomno == roomno) {
      return i;
    };
  };
};

// 소켓으로 회원인덱스 구하기
function userIndex(socket) {
  for(i in users) {
    if(users[i].sid === socket.id) {
      return i;
    };
  };
};

// 회원 아이디로 회원 객체 반환
function target(userid) {
  for(i in users) {
    if(users[i].uid === userid) {
      return users[i];
    };
  };
};

// 클라이언트가 socket.io서버에 접속
io.on('connection', function (socket) {

  // 회원 객체 생성 및 목록에 추가, 방 객체 생성 및 목록에 추가, 목록 데이터 전송, 메시지 전송
  socket.on('enter', function(msg) {
    if(!msg.uid) {
      return;
    };
    for(i in users) {
      if(users[i].uid === msg.uid) {
        return;
      };
    };
    socket.join('waitroom');

    var user = new User(socket.id, msg.uid, msg.name, 'waitroom');
    users.push(user);

    var rusers = usersInRoom('waitroom');
    socket.broadcast.in('waitroom').emit('enterroom', user);
    socket.emit('userlist', rusers);
    socket.emit('roomlist', rooms);
    io.in('waitroom').emit('message', user.name + '(' + user.uid + ')' + '님이 대기실에 접속했습니다.');
  });

  // 회원 객체를 배열에서 삭제, 회원 갱신, 아웃 메시지 전송
  socket.on('disconnect', function () {
    var user = users[userIndex(socket)];

    if(user) {
      users.splice(userIndex(socket), 1);

      var room = user.roomno;
      var rusers = usersInRoom(room);
      io.in(room).emit('userlist', rusers);
      io.in(room).emit('message', user.name + '(' + user.uid + ')' + '님이 접속을 끊었습니다.');
    }
  });

  // 귓속말
  socket.on('private', function (msg) {
    var targetUser = target(msg.target);
    var targetSid = targetUser.sid;

    var fromUser = target(msg.id);
    var fromSid = fromUser.sid;

    io.to(targetSid).to(fromSid).emit('message', fromUser.name + '(' + fromUser.uid + ')' + '님이 ' + targetUser.name + '(' + targetUser.uid + ')' + '님에게 귓속말: ' + msg.msg);
  });

  // 전체 수신 메시지
  socket.on('message', function(msg) {
    var user = target(msg.id);

    io.in(user.roomno).emit('message', user.name + '(' + user.uid + '): ' + msg.msg);
  });

  // 방 만들기
  socket.on('create', function(msg) {
    var user = target(msg.userid);

    if(user.roomno !== 'waitroom') {
      return;
    }

    var room = new Room(rno, msg.rname, msg.usercnt, msg.userid);
    rooms.unshift(room);

    changeRoom(socket, waitroom, room, user);

    io.in('waitroom').emit('createRoom', new Array(room));
    socket.emit('join', room);
  });

  // 방 참여하기
  socket.on('join', function(msg) {
    var user = target(msg.id);

    if(user.roomno !== 'waitroom') {
      return;
    }

    var i = roomIndex(msg.rno);
    var room = rooms[i];
    var ruserscnt = usersInRoom(msg.rno).length;

    if(ruserscnt < room.usercnt) {
      changeRoom(socket, waitroom, room, user);

      socket.emit('join', room);
    } else {
      socket.emit('alert', '방이 꽉찼습니다.');
    }
  });

  // 방 나가기
  socket.on('exit', function(room, id) {
    var user = target(id);

    changeRoom(socket, room, waitroom, user);

    socket.emit('roomlist', rooms);
    socket.emit('exit');

    var ruserscnt = usersInRoom(room.roomno).length;

    if(ruserscnt === 0) {
      var i = roomIndex(room.roomno);
      rooms.splice(i, 1);

      io.in('waitroom').emit('deleteRoom', room);
    }
  });

  // 방의 회원 수와 목록 보기
  socket.on('detail', function(roomno) {
    var rusers = usersInRoom(roomno);

    socket.emit('detail', {roomno: roomno, rusers: rusers, ruserscnt: rusers.length});
  });

  // 팀 바꾸기
  socket.on('teamChange', function(id) {
    var user = target(id);

    if(user.team == 'home') {
      user.team = 'away';
    } else {
      user.team = 'home';
    }

    io.in(user.roomno).emit('teamChange', user);
  });







});
