var fs = require("fs");
var http = require("http");

var peerSessions = {};
var groupSessions = {};

function ensurePeerSession(groupSessionId, peerSessionId) {
    var peerSession = peerSessions[peerSessionId];
    if (!peerSession)
        peerSession = peerSessions[peerSessionId] = {};
    peerSession.groupSessionId = groupSessionId;
    peerSession.lastSeen = +new Date();
    if (peerSession.messageChannel && peerSession.messageChannel.maybeSend)
        return peerSession;

    function maybeLeave() {
        if (peerSessions[peerSessionId].connected)
            return;
        delete groupSessions[groupSessionId].peerSessions[peerSessionId];
        delete peerSessions[peerSessionId];
        for (var anotherPeerSessionId in groupSession.peerSessions) {
            var anotherPeerSession = peerSessions[anotherPeerSessionId];
            anotherPeerSession.messageChannel.postMessage(JSON.stringify({
                "event": "leave",
                "who": peerSessionId
            }));
        }
        console.log("@" + groupSessionId + " - " + peerSessionId + " left.");
    }

    peerSession.messageChannel = new function() {
        var sendstr = "";
        var hangingResponse = null;

        this.hasUplink = function () {
            return hangingResponse != null;
        };

        this.handleIncomingData = function (data) {
            var datalen = data.length;
            for (var i = 0; i < datalen; i++) {
                var colonPos = data.indexOf(':', i);
                if (colonPos == -1)
                    break;
                var len = parseInt(data.substring(i, colonPos));
                if (!len)
                    break;
                i = colonPos + len + 1;
                if (data.charAt(i) != ',')
                    break;
                this.onmessage({
                    "data": data.substring(colonPos + 1, i),
                    "groupSessionId": groupSessionId,
                    "peerSessionId": peerSessionId
                });
            }
        };

        this.maybeSend = function (response) {
            if (!sendstr) {
                hangingResponse = response;
                hangingResponse.on("close", function () {
                    hangingResponse = null;
                    setTimeout(maybeLeave, 1000);
                });
                return;
            }

            var res = response || hangingResponse;
            if (res) {
                res.end(sendstr);
                sendstr = "";
                hangingResponse = null;
                setTimeout(maybeLeave, 1000);
            }
        };

        this.postMessage = function (msg) {
            sendstr += msg.length + ":" + msg + ",";
            this.maybeSend();
        };
    };

    peerSession.__defineGetter__("connected", function () {
        return peerSession.messageChannel.hasUplink();
    });

    peerSession.messageChannel.onmessage = function (evt) {
        var msg = JSON.parse(evt.data);
        var otherPeerSessionId = msg.to;
        var signalingMessage = msg.data;

        var otherPeerSession;
        var groupSession = groupSessions[evt.groupSessionId];
        if (!groupSession || !(otherPeerSession = peerSessions[otherPeerSessionId]))
            return;

        console.log("@" + evt.groupSessionId + " - " + evt.peerSessionId + " => " + otherPeerSessionId + " :");
        console.log(signalingMessage);
        otherPeerSession.messageChannel.postMessage(JSON.stringify({
            "event": "message",
            "from": evt.peerSessionId,
            "data": signalingMessage
        }));
    };

    var groupSession = groupSessions[groupSessionId];
    if (!groupSession)
        groupSession = groupSessions[groupSessionId] = {"peerSessions" : {}};

    if (!groupSession.peerSessions.hasOwnProperty(peerSessionId)) {
        for (var anotherPeerSessionId in groupSession.peerSessions) {
            if (!groupSession.peerSessions.hasOwnProperty(anotherPeerSessionId))
                continue;
            var anotherPeerSession = peerSessions[anotherPeerSessionId];
            if (!anotherPeerSession) {
                delete groupSession.peerSessions[anotherPeerSessionId];
                continue;
            }
            anotherPeerSession.messageChannel.postMessage(JSON.stringify({
                "event": "join",
                "who": peerSessionId
            }));
            peerSession.messageChannel.postMessage(JSON.stringify({
                "event": "join",
                "who": anotherPeerSessionId
            }));
        }
        groupSession.peerSessions[peerSessionId] = 1;
    }

    console.log("@" + groupSessionId + " - " + peerSessionId + " joined.");

    return peerSession;
};

var server = http.Server(function (request, response) {
    var parts = request.url.split("/");

    if (parts[1] == "") {
        // client code delivery
        fs.readFile("client_xhr.html", function (error, content) {
            if (error) {
                response.writeHead(404);
                response.end();
                return;
            }
            response.writeHead(200, {"Content-Type": "text/html"});
            response.end(content);
        });
    }
    else if (parts[1] == "ctos" || parts[1] == "stoc") {
        var groupSessionId = parts[2];
        var peerSessionId = parts[3];
        if (!groupSessionId || !peerSessionId) {
            response.writeHead(400);
            response.end();
            return;
        }

        var peerSession = ensurePeerSession(groupSessionId, peerSessionId);

        if (parts[1] == "ctos") {
            var data = "";
            request.setEncoding("utf8");
            request.on("data", function (chunk) { data += chunk; });
            request.on("end", function () {
                peerSession.messageChannel.handleIncomingData(data);
                response.writeHead(204, {});
                response.end();
            });
        }
        else { /* stoc */
            response.writeHead(200, {"Content-Type": "text/plain;charset=utf-8"});
            peerSession.messageChannel.maybeSend(response);
        }
    }
    else {
        response.writeHead(404);
        response.end();
    }
});
server.listen(8080);
