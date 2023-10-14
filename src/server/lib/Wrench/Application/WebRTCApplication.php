<?php

namespace Wrench\Application;

use Wrench\Application\Application;
//use Wrench\Application\NamedApplication;

/**
 * Example application for Wrench: echo server
 */
class WebRTCApplication extends Application
{
	static $rooms = array();

	private function getClient($sockId) {

		global $rooms;
		foreach ($rooms as $room => $clients) {
			foreach($clients as  $c) {
				if ($sockId == $c->getId()) {
					return $c;
				}
			}
		}
		return null;
	}

	/**
 	 * @see Wrench\Application.Application::onData()
 	 */
	public function onData($message, $client)
	{
		global $rooms;
		$cmd = array();
		$cmd["data"] = array();
		$data = json_decode($message);

		switch ($data->eventName) {
		case "join room":
			$room = $data->data->room;
			if (!$rooms[$room]) {
				$rooms[$room] = array();
			}
			$cmd["eventName"] = "new peer connected";
			$cmd["data"]["socketId"] = $client->getId();
			foreach ($rooms[$room] as $c) {
				$c->send(json_encode($cmd));
			}
			array_push($rooms[$room], $client);

			$connections = array();
			foreach ($rooms[$room] as $c) {
				if ($c->getId() != $client->getId()) {
					array_push($connections, $c->getId());
				}
			}
			$cmd["eventName"] = "get peers";
			$cmd["data"] = array();
			$cmd["data"]["connections"] = $connections;
			$client->send(json_encode($cmd));
			break;
		case "receive ice candidate":
			$c = $this->getClient($data->data->socketId);
			if ($c) {
				$cmd["eventName"] = "receive ice candidate";
				$cmd["data"]["index"] = $data->data->index;
				$cmd["data"]["label"] = $data->data->label;
				$cmd["data"]["candidate"] = $data->data->candidate;
				$cmd["data"]["socketId"] = $client->getId();
//echo(json_encode($cmd) . "\n");
				$c->send(json_encode($cmd));
			}
			break;
		case "send offer":
			$c = $this->getClient($data->data->socketId);
			if ($c) {
				$cmd["eventName"] = "receive offer";
				$cmd["data"]["sdp"] = $data->data->sdp;
				$cmd["data"]["socketId"] = $client->getId();
//echo(json_encode($cmd) . "\n");
				$c->send(json_encode($cmd));
			}
			break;
		case "send answer":
			$c = $this->getClient($data->data->socketId);
			if ($c) {
				$cmd["eventName"] = "receive answer";
				$cmd["data"]["sdp"] = $data->data->sdp;
				$cmd["data"]["socketId"] = $client->getId();
//echo(json_encode($cmd) . "\n");
				$c->send(json_encode($cmd));
			}
			break;
		case "heartbeat":
			break;
		case "disconnect":
			break;
		}
	}
}
