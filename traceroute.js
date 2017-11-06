'use strict';


var Child = require('child_process');
var Dns = require('dns');
var Net = require('net');
var Os = require('os');


var internals = {};


internals.isWin = /^win/.test(Os.platform());


module.exports = internals.Traceroute = {};


internals.Traceroute.trace = function (host, timeout, callback) {
    if (typeof(timeout) == "function") {
        callback = timeout;
        timeout = null;
    }

    Dns.lookup(host.toUpperCase(), function(err) {

        if (err && Net.isIP(host) === 0) {
            return callback(new Error('Invalid host'));
        }

        var command = (internals.isWin ? 'tracert -d ' : 'traceroute -q 1 -n ') + host;

        // console.log("command", command);

        var exited = false, start = new Date();

        // var traceroute = Child.exec(command, function(err, stdout, stderr) {
        //     exited = true;
            
        //     // console.log("err", err);
        //     // console.log("stdout", stdout);
        //     // console.log("stderr", stderr);

        //     if (err) {
        //         return callback(err);
        //     }

        //     var results = internals.parseOutput(stdout);

        //     return callback(null, results);
        // });

        command = command.split(" ");

        var traceroute = Child.spawn(command[0], command.slice(1));

        var all_data = "";

        traceroute.stdout.on("data", function(data) {
            data = new Buffer(data) + "";
            // console.log(host, "data", (data));

            all_data += data;
        });

        traceroute.on("close", function(code) {
            exited = true;

            // console.log("all_data", all_data);

            // console.log("traceroute exited", code);

            callback(null, internals.parseOutput(all_data));
        });

        if (timeout) {
            var timer_id = setInterval(function() {
                clearInterval(timer_id);

                if (!exited) {
                    console.log("Timeout exceeded.  Killing traceroute to host", host);
                    traceroute.kill();
                }
            }, timeout);            
        }
    });
};


internals.parseHop = function (hop) {

    var line = hop.replace(/\*/g,'0');

    if (internals.isWin) {
        line = line.replace(/\</g,'');
    }

    var s = line.split(' ');
    for (var i = s.length - 1; i > -1; --i) {
        if (s[i] === '' || s[i] === 'ms') {
            s.splice(i,1);
        }
    }

    return internals.isWin ? internals.parseHopWin(s) : internals.parseHopNix(s);
};


internals.parseHopWin = function (line) {

    if (line[4] === 'Request') {
        return false;
    }

    var hop = {};
    hop[line[4]] = [+line[1], +line[2], +line[3]];

    return hop;
};


internals.parseHopNix = function (line) {

    if (line[1] === '0') {
        return false;
    }

    var hop = {};
    var lastip = line[1];

    hop[line[1]] = [+line[2]];

    for (var i = 3; i < line.length; ++i) {
        if (Net.isIP(line[i])) {
            lastip = line[i];
            if (!hop[lastip]) {
                hop[lastip] = [];
            }
        }
        else {
            hop[lastip].push(+line[i]);
        }
    }

    return hop;
};

internals.parseOutput = function (output) {

    var lines = output.split('\n');
    var hops = [];

    // lines.shift();
    lines.pop();

    if (internals.isWin) {
        for (var i = 0; i < lines.length; ++i) {
            if (/^\s+1/.test(lines[i])) {
                break;
            }
        }
        lines.splice(0,i);
        lines.pop();
        lines.pop();
    }

    for (var i = 0; i < lines.length; ++i) {
        hops.push(internals.parseHop(lines[i]));
    }

    return hops;
};
