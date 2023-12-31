#!/usr/bin/env perl

# $Id: wrtcserver.pl,v 1.2 2002/02/05 17:53:08 68user Exp $

use strict;
use warnings;

use IO::Select;
use IO::Socket;
use Protocol::WebSocket::Handshake::Server;
use Protocol::WebSocket::Frame;
use JSON::XS;
use Digest::MD5 'md5_hex';
use Sys::Syslog;
#use Data::Dumper;

my $client_waiting;
my $port = 8282;
my @all_sockets;
my %rooms = ();
my %data_sockets = ();  # 現在有効なデータコネクション用のハッシュテーブル
my %hand_shakes = ();

&init;
&run;

sub interrupt {

#	eval{ close(XXXXX);  };  # グローバルで開いているファイルがあれば、閉じる
	closelog();

	my $sig = shift;
	setpgrp;                 # I *am* the leader
	$SIG{$sig} = 'IGNORE';
	kill $sig, 0;            # death to all-comers
	die "killed by $sig";

	exit(0);
}

sub init {

	$SIG{INT}  = 'interrupt';		# Ctrl-C が押された場合
	$SIG{HUP}  = 'interrupt';		# HUP  シグナルが送られた場合
	$SIG{QUIT} = 'interrupt';		# QUIT シグナルが送られた場合
	$SIG{KILL} = 'interrupt';		# KILL シグナルが送られた場合
	$SIG{TERM} = 'interrupt';		# TERM シグナルが送られた場合
	openlog("WebRTC chat server", "ndelay,pid", "local0");

#	Proc::Daemon::Init if $DAEMON;   # as a daemon
}

sub run {
	while (1 > 0) {
		my $listener = new IO::Socket::INET(Listen => 1, LocalPort => 8282, ReuseAddr => 1);
		#selectorにリスナーソケットを追加。あとで更に、クライアントのソケットも投げ込みます。
		my $selector = new IO::Select( $listener );
		while (my @ready = $selector->can_read) {
			foreach my $fh (@ready) {
				if ($fh == $listener) {
					# 新規接続を受け付け、selectorに追加
					my $new = $listener->accept;
					$selector->add($new);
					# 接続中のクライアントをテーブルに登録
					$data_sockets{$new} = 1;
					$hand_shakes{$new} = Protocol::WebSocket::Handshake::Server->new;
				} elsif (defined($data_sockets{$fh})) {
					if ($data_sockets{$fh} == 1) {
						my $hs = $hand_shakes{$fh};
						my $frame_chunk = '';
						until ($hs->is_done) {
							$fh->sysread(my $buf, 2048);
							if ($buf) {
								$hs->parse($buf);
								if ($hs->error) {
									syslog("err", "handshake failled: " . $hs->error);
								} else {
									$fh->syswrite($hs->to_string);
									$data_sockets{$fh} = 2;
								}
							}
						}
					} else {
						# 入力を処理する。切断もここで処理
						my $frame = Protocol::WebSocket::Frame->new;
						$fh->sysread(my $buf, 16384);
						$frame->append($buf);
						while (my $message = $frame->next) {
							$message = Protocol::WebSocket::Frame->new($message)->to_bytes;
							&process_messsage($fh, $message);
						}
					}
				}
			}
		}
		syslog("err", "can_read timeout.");
	}
	syslog("err", "out of loop.");
}

sub process_messsage {
	my $fh = $_[0];
	my $message = $_[1];
	my $idx = index($message, '{');
	if (!defined($idx)) {
		return;
	}
	$message = substr($message, $idx);
print "R $message\n";
	my $data = JSON::XS->new->utf8->decode($message);
	my $cmd = {eventName => '', data => {}};

	if ($data->{eventName} eq 'join room') {
		if (!$rooms{$data->{data}->{room}}) {
			$rooms{$data->{data}->{room}} = ();
		}

		my @connections;
		$cmd->{eventName} = 'new peer connected';
		$cmd->{data}->{socketId} = md5_hex($fh . '');
		foreach my $s (@{$rooms{$data->{data}->{room}}}) {
			$s->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
			push @connections, md5_hex($s . '');
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";
		}

		$cmd->{eventName} = 'get peers';
		$cmd->{data} = ();
		@{$cmd->{data}->{connections}} = @connections;
		$fh->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";

		push @{$rooms{$data->{data}->{room}}}, $fh;

	} elsif ($data->{eventName} eq 'receive ice candidate') {
		my $s = get_client($data);
		if ($s) {
			$cmd->{eventName} = "receive ice candidate";
			$cmd->{data}->{index} = $data->{data}->{index};
			$cmd->{data}->{label} = $data->{data}->{label};
			$cmd->{data}->{candidate} = $data->{data}->{candidate};
			$cmd->{data}->{socketId} = md5_hex($fh . '');
			$s->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";
		}

	} elsif ($data->{eventName} eq 'send offer') {
		my $s = get_client($data);
		if ($s) {
			$cmd->{eventName} = "receive offer";
			$cmd->{data}->{sdp} = $data->{data}->{sdp};
			$cmd->{data}->{socketId} = md5_hex($fh . '');
			$s->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";
		}

	} elsif ($data->{eventName} eq 'send answer') {
		my $s = get_client($data);
		if ($s) {
			$cmd->{eventName} = "receive answer";
			$cmd->{data}->{sdp} = $data->{data}->{sdp};
			$cmd->{data}->{socketId} = md5_hex($fh . '');
			$s->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";
		}
	} elsif ($data->{eventName} eq 'disconnect') {
		$cmd->{eventName} = 'remove peer connected';
		$cmd->{data}->{socketId} = md5_hex($fh . '');
		foreach my $s (@{$rooms{$data->{data}->{room}}}) {
			if ($s ne $fh) {
				$s->syswrite(Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes);
print "S " . Protocol::WebSocket::Frame->new(encode_json($cmd))->to_bytes. "\n";
			}
		}
		my $cnt = 0;
		foreach my $s (@{$rooms{$data->{data}->{room}}}) {
			if ($s eq $fh) {
				splice(@{$rooms{$data->{data}->{room}}}, $cnt, 1);
			}
			++$cnt;
		}
		delete $data_sockets{$fh};	# テーブルから削除
		delete $hand_shakes{$fh};
#		$fh->close;					# ファイルハンドルを close
	}
}

sub get_client {
	my $data = $_[0];
	foreach my $s (@{$rooms{$data->{data}->{room}}}) {
		if ($data->{data}->{socketId} eq md5_hex($s . '')) {
			return $s
		}
	}
#	foreach my $room (keys %rooms) {
#		foreach my $s (@{$rooms{$room}}) {
#			if ($data->{data}->{socketId} eq md5_hex($s . '')) {
#				return $s
#			}
#		}
#	}
	syslog("err", "get_client failed");
	return undef;
}

__END__
