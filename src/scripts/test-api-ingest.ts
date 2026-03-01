async function test() {
    try {
        const response = await fetch("http://localhost:3000/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: "Hey everyone! Check out this hackathon: https://forms.gle/test123 - great opportunity for CS students!",
                source: "WhatsApp",
                url: "https://forms.gle/test123",
                priority: 2,
            }),
        });

        const data = await response.json();
        console.log("Response:", data);
    } catch (e) {
        console.error("Failed:", e);
    }
}

test();
