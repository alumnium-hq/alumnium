package ai.alumnium;

import ai.alumnium.client.HttpClient;

public class Cache {
    private final HttpClient client;

    public Cache(HttpClient client) {
        this.client = client;
    }

    public void save() {
        client.saveCache();
    }
    
    public void discard() {
        client.discardCache();
    }
}
