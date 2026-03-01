import { simpleParser } from "mailparser";

const rawEmail = `From: "Unacademy" <no-reply@unacademy.com>
To: sayandeepsen@example.com
Subject: FLAT 60% off on IIT JEE subscriptions!
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: quoted-printable

FLAT 60% off on IIT JEE subscriptions!
=0A=
=0A=
96 =0A=
Offer valid t=
ill February 28
`;

async function main() {
    try {
        const parsed = await simpleParser(rawEmail);
        console.log("TEXT:", parsed.text);
        console.log("HTML:", parsed.textAsHtml);
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
