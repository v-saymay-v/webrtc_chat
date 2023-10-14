// 日本語
(function() {

	var rtc;
	if ('undefined' === typeof module) {
		rtc = this.rtc = {};
	} else {
		rtc = module.exports = {};
	}

	// Fallbacks for vendor-specific variables until the spec is finalized.
	var getUserMedia = navigator.webkitGetUserMedia	||
					   navigator.mozGetUserMedia ||
					   navigator.msGetUserMedia	||
					   navigator.getUserMedia;
	var URL = window.webkitURL || window.msURL || window.URL || window.oURL;
	var PeerConnection;
	var IceCandidate;
	var SessionDescription;
	if (WebRtc4all_GuessType() == WebRtcType_e.NATIVE) {
		PeerConnection = window.webkitPeerConnection ||
						 window.mozPeerConnection ||
						 window.msPeerConnection ||
						 window.PeerConnection ||
						 window.webkitRTCPeerConnection	||
						 window.mozRTCPeerConnection ||
						 window.msRTCPeerConnection	||
						 window.RTCPeerConnection;
		IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
		SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
	} else {
		PeerConnection = w4aPeerConnection;
		IceCandidate = w4aIceCandidate;
		SessionDescription = w4aSessionDescription;
	}

	// Holds callbacks for certain events.
	rtc._events = {};

	// Holds the STUN server to use for PeerConnections.
	rtc.SERVER = { "iceServers": [{ "url": "stun:stun.l.google.com:19302" }] };
	rtc.mediaConstraints = {'mandatory': {'OfferToReceiveAudio':true,'OfferToReceiveVideo':true}};

	// Reference to	the lone PeerConnection instance.
	rtc.peerConnections = {};
	rtc.remoteDescriptions = {};

	// Array of known peer socket ids
	rtc.connections = [];

	// Stream-related variables.
	rtc.streams = [];
	rtc.numStreams = 0;
	rtc.initializedStreams = 0;

	rtc.on = function(eventName, callback) {
		rtc._events[eventName] = rtc._events[eventName] || [];
		rtc._events[eventName].push(callback);
	};

	rtc.fire = function(eventName, _) {
		var events = rtc._events[eventName];
		var args = Array.prototype.slice.call(arguments, 1);

		if (!events) {
			return;
		}

		for (var i = 0, len = events.length; i < len; i++) {
			events[i].apply(null, args);
		}
	};

	/**
	 * Connects to the socket.io server.
	 */
	rtc.connect = function(server, port, room) {
		rtc.room = room || '';	// by default, join a room called the blank string

		rtc.on('receive ice candidate', function(data) {
console.log('receive ice candidate fired(' + data.socketId + ')');
			var dic = {candidate: data.candidate, sdpMid: data.label, sdpMLineIndex: data.index};
			var candidate = new IceCandidate(dic);
			var pc = rtc.peerConnections[data.socketId];
			if (WebRtc4all_GuessType() == WebRtcType_e.NATIVE) {
				pc.addIceCandidate(candidate);
			} else {
				var rd = rtc.remoteDescriptions[data.socketId];
				if (rd) {
					rd.addCandidate(candidate);
				}
				pc.processIceMessage(candidate);
			}
		});

		rtc.on('new peer connected', function(data) {
console.log('new peer connected fired(' + data.socketId + ')');
			var pc = rtc.createPeerConnection(data.socketId);
			for (var i = 0; i < rtc.streams.length; i++) {
				var stream = rtc.streams[i];
				pc.addStream(stream);
			}
		});

		rtc.on('remove peer connected', function(data) {
console.log('remove peer connected fired(' + data.socketId + ')');
			console.log(data);
			//the actual onremovestream function not yet supported. Here is a temporary workaround
			rtc.fire('disconnect stream', data.socketId);
			//rtc.peerConnections[data.socketId].close();
			delete rtc.peerConnections[data.socketId];
		});

		rtc.on('receive offer', function(data) {
console.log('receive offer fired(' + data.socketId + ')');
			rtc.receiveOffer(data.socketId, data.sdp);
		});

		rtc.on('receive answer', function(data) {
console.log('receive answer fired(' + data.socketId + ')');
			rtc.receiveAnswer(data.socketId, data.sdp);
		});

		// TODO: Fix possible race condition if get peers is not emitted
		// before the "ready" event is fired.
		rtc.on('get peers', function(data) {
console.log('get peers fired');
			rtc.connections = data.connections;
		});

		rtc.on('client close', function(data) {
console.log('client close fired');
			var json = JSON.stringify({eventName: 'disconnect', data: {'room': rtc.room}});
			rtc.ws.send(json);
		});

		rtc.on('heartbeat', function(data) {
			var json = JSON.stringify({eventName: 'heartbeat', data:{}});
			rtc.ws.send(json);
			setTimeout(function() {
				rtc.fire('heartbeat', null);
			}, 25000);
		});

		if (typeof WebSocket === 'undefined') {
			rtc.ws = new MozWebSocket("ws://" + server + ":" + port + "/webrtc");
		} else {
			rtc.ws = new WebSocket("ws://" + server + ":" + port + "/webrtc");
		}

		rtc.ws.onopen =  function (e) {
			var json = JSON.stringify({eventName: 'join room', data: {'room': rtc.room}});
console.log("ws onopen send: " + json);
			rtc.ws.send(json);
			setTimeout(function() {
				rtc.fire('heartbeat', null);
			}, 25000);
		};

		rtc.ws.onclose = function (e) {
console.log("ws onclose connection closed: " + rtc.ws.readyState);
		};

		String.prototype.replaceAll = function(org, dest){
			return this.split(org).join(dest);
		}

		rtc.ws.onmessage = function (event) {
			var data;
console.log('onmessage: ' + event.data);
			if (event.data.indexOf('"SDP\\n{') >= 0) {
				var str = event.data.replace('"SDP\\n{','{').replace('":0}",', '":0},').replaceAll('\\"','"').replaceAll('\\\\r','\\r').replaceAll('\\\\n','\\n');
console.log('replace: ' + str);
				data = JSON.parse(str);
				if (data.eventName == "receive answer" || data.eventName == "receive offer") {
					data.data.sdp.type = data.data.sdp.messageType.toLowerCase();
					delete data.data.sdp.messageType;
					delete data.data.sdp.offererSessionId;
					delete data.data.sdp.seq;
					delete data.data.sdp.tieBreaker;
				}
			} else {
				data = JSON.parse(event.data);
			}
			rtc.fire(data.eventName, data.data);
		};

		rtc.ws.onerror = function (e) {
console.log('ws onerror');
		};
	};

	rtc.createPeerConnections = function() {
		for (var i = 0;	i < rtc.connections.length; i++) {
			rtc.createPeerConnection(rtc.connections[i]);
		}
	};

	rtc.createPeerConnection = function(id) {
		var pc = {};
		if (WebRtc4all_GetType() == WebRtcType_e.NATIVE) {
			pc = rtc.peerConnections[id] = new PeerConnection(rtc.SERVER);
		} else {
			rtc.onicecandidate = function(event) {
				if (event.candidate) {
					var json = JSON.stringify({eventName: 'receive ice candidate', data: {
						'room': rtc.room,
						'index': event.candidate.sdpMLineIndex,
						'label': event.candidate.sdpMid,
						'candidate': event.candidate.candidate,
						'socketId': id
					}});
console.log('receive ice candidate: ' + json);
					rtc.ws.send(json);
				}
			};
			pc = rtc.peerConnections[id] = new PeerConnection("stun:stun.l.google.com:19302", rtc.onicecandidate);
			pc.addStream = function(o_stream, o_hints) {
				rtc.fire('add remote stream', o_stream, id);
			};
		}
console.log('create peer connection(' + id + ') => ' + pc);
		pc.onicecandidate = function(event) {
			if (event.candidate) {
				var json = JSON.stringify({eventName: 'receive ice candidate', data: {
					'room': rtc.room,
					'index': event.candidate.sdpMLineIndex,
					'label': event.candidate.sdpMid,
					'candidate': event.candidate.candidate,
					'socketId': id
				}});
console.log('receive ice candidate: ' + json);
				rtc.ws.send(json);
			}
		};

		pc.onopen = function() {
			// TODO: Finalize this API
console.log('peer connection opened');
		};

		pc.onaddstream = function(event) {
			// TODO: Finalize this API
console.log('add remote stream fired');
			rtc.fire('add remote stream', event.stream, id);
		};
		return pc;
	};

	rtc.sendOffers = function() {
		for (var i = 0, len = rtc.connections.length; i < len; i++) {
			var socketId = rtc.connections[i];
			rtc.sendOffer(socketId);
		}
	};

	rtc.sendOffer = function(socketId) {
		rtc.setOfferDescription = function (offer) {
			var pc = rtc.peerConnections[socketId];
			if (WebRtc4all_GetType() == WebRtcType_e.NATIVE) {
				pc.setLocalDescription(offer);
			} else {
				pc.setLocalDescription(w4aPeerConnection.SDP_OFFER, offer);
			}
			var json = JSON.stringify({eventName: 'send offer', data:{room: rtc.room, socketId: socketId, sdp: offer}});
console.log('setOfferDiscription:' + json);
			rtc.ws.send(json);
		}

console.log('sendOffer');
		var pc = rtc.peerConnections[socketId];
		// TODO: Abstract away video: true, audio: true for offers
		pc.createOffer(rtc.setOfferDescription, function(){}, rtc.mediaConstraints);
	};

	rtc.receiveOffer = function(socketId, sdp) {
console.log('receiveOffer: ' + JSON.stringify(sdp));
		var pc = rtc.peerConnections[socketId];
		if (WebRtc4all_GetType() == WebRtcType_e.NATIVE) {
			pc.setRemoteDescription(new SessionDescription(sdp));
		} else {
			var rd = rtc.remoteDescriptions[socketId] = new SessionDescription(sdp);
			pc.setRemoteDescription(w4aPeerConnection.SDP_OFFER, rd);
		}
		if (WebRtc4all_GetType() == WebRtcType_e.NATIVE) {
			rtc.sendAnswer(socketId);
		} else {
			var hints = {has_audio:true, has_video: true};
			var answer = pc.createAnswer(sdp, hints);
			pc.setLocalDescription(w4aPeerConnection.SDP_ANSWER, answer);
			var json = JSON.stringify({eventName: 'send answer', data:{room: rtc.room, socketId: socketId, sdp: {type: 'answer', sdp:answer.toSdp()}}});
console.log('setAnswerDiscription: ' + json);
			rtc.ws.send(json);
		}
	};

	rtc.sendAnswer = function(socketId) {
		rtc.setAnswerDescription = function (answer) {
			var pc = rtc.peerConnections[socketId];
			pc.setLocalDescription(answer);
			var json = JSON.stringify({eventName: 'send answer', data:{room: rtc.room, socketId: socketId, sdp: answer}});
console.log('setAnswerDiscription: ' + json);
			rtc.ws.send(json);
		}

console.log('sendAnswer');
		var pc = rtc.peerConnections[socketId];
		// TODO: Abstract away video: true, audio: true for answers
		pc.createAnswer(rtc.setAnswerDescription, function(){}, rtc.mediaConstraints);
	};

	rtc.receiveAnswer = function(socketId, sdp) {
console.log('receiveAnswer');
		var pc = rtc.peerConnections[socketId];
		pc.setRemoteDescription(new SessionDescription(sdp));
	};

	rtc.createStream = function(domId, onSuccess, onFail) {
console.log('createStream');
		var el = document.getElementById(domId);
		var options;
		onSuccess = onSuccess || function() {};
		onFail = onFail || function() {};

		if (el.tagName.toLowerCase() === "audio") {
			options = {"audio": true, "toString": function() { return "audio";}};
		} else {
			options =  {"audio": true, "video": true, "toString": function() { return "audio, video";}};
		}

		if (getUserMedia) {
			rtc.numStreams++;
			getUserMedia.call(navigator, options, function(stream) {
				if (URL && URL.createObjectURL) {
					el.src = URL.createObjectURL(stream);
				} else {
					el.src = stream;
				}
				rtc.streams.push(stream);
				rtc.initializedStreams++;
				onSuccess(stream);
				if (rtc.initializedStreams === rtc.numStreams) {
					rtc.fire('ready');
				}
			}, function() {
				alert("Could not connect stream.");
				onFail();
			});
		} else {
			alert('webRTC is not yet supported in this browser.');
		}
	}

	rtc.addStreams = function()	{
console.log('addStreams');
		for (var i = 0; i < rtc.streams.length; i++) {
			var stream = rtc.streams[i];
			for (var connection in rtc.peerConnections) {
				rtc.peerConnections[connection].addStream(stream);
			}
		}
	};

	rtc.attachStream = function(stream, domId) {
console.log('attachStream');
		if (URL && URL.createObjectURL) {
			document.getElementById(domId).src = URL.createObjectURL(stream);
		} else {
			document.getElementById(domId).src = stream;
		}
	};

	rtc.on('ready',	function() {
console.log('ready');
		rtc.createPeerConnections();
		rtc.addStreams();
		rtc.sendOffers();
	});

}).call(this);
