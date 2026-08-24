from alumnium.drivers.cdp_network_monitor import CdpNetworkMonitor
from alumnium.drivers.waiter import wait_for_page_to_load


def request(request_id: str, resource_type: str = "Fetch") -> dict:
    return {
        "requestId": request_id,
        "type": resource_type,
        "request": {"url": f"https://example.com/{request_id}"},
    }


def test_tracks_request_until_finished():
    monitor = CdpNetworkMonitor()

    monitor.process("Network.requestWillBeSent", request("1"))
    assert monitor.pending() == ["https://example.com/1"]

    monitor.process("Network.loadingFinished", {"requestId": "1"})
    assert monitor.pending() == []


def test_namespaces_request_ids_by_session():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("1"), "main")
    monitor.process("Network.requestWillBeSent", request("1"), "iframe")

    monitor.process("Network.loadingFinished", {"requestId": "1"}, "main")

    assert monitor.pending() == ["https://example.com/1"]


def test_finishes_request_transferred_to_oopif_session():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("document"), "parent")

    monitor.process("Network.loadingFinished", {"requestId": "document"}, "oopif")

    assert monitor.pending() == []


def test_does_not_finish_ambiguous_request_id_from_another_session():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("1"), "main")
    monitor.process("Network.requestWillBeSent", request("1"), "iframe")

    monitor.process("Network.loadingFinished", {"requestId": "1"}, "other")

    assert monitor.pending() == ["https://example.com/1", "https://example.com/1"]


def test_ignores_persistent_transports():
    monitor = CdpNetworkMonitor()

    monitor.process("Network.requestWillBeSent", request("socket", "WebSocket"))
    monitor.process("Network.requestWillBeSent", request("events", "EventSource"))

    assert monitor.pending() == []


def test_ignores_streaming_response():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("stream"))

    monitor.process(
        "Network.responseReceived",
        {
            "requestId": "stream",
            "response": {"mimeType": "text/event-stream", "headers": {}},
        },
    )

    assert monitor.pending() == []


def test_finishes_finite_response_when_all_body_data_is_received():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("finite"))
    monitor.process(
        "Network.responseReceived",
        {"requestId": "finite", "response": {"headers": {"Content-Length": "16"}}},
    )

    monitor.process(
        "Network.dataReceived",
        {"requestId": "finite", "dataLength": 16, "encodedDataLength": 16},
    )

    assert monitor.pending() == []


def test_keeps_finite_response_pending_until_full_body_is_received():
    monitor = CdpNetworkMonitor()
    monitor.process("Network.requestWillBeSent", request("partial"))
    monitor.process(
        "Network.responseReceived",
        {"requestId": "partial", "response": {"headers": {"content-length": "16"}}},
    )

    monitor.process(
        "Network.dataReceived",
        {"requestId": "partial", "dataLength": 8, "encodedDataLength": 8},
    )

    assert monitor.pending() == ["https://example.com/partial"]


def test_waits_for_short_timeouts():
    monitor = CdpNetworkMonitor()
    calls = 0

    def snapshot():
        nonlocal calls
        calls += 1
        return {
            "lastMutationAt": 0,
            "now": 100,
            "pendingTimeouts": 1 if calls == 1 else 0,
            "readyState": "complete",
        }

    loaded, pending = wait_for_page_to_load(monitor, snapshot, idle=0, timeout=0.1)

    assert loaded
    assert pending == []
    assert calls == 2
