import { NextResponse } from "next/server";
import { applyToEvent } from "@/actions/apply-to-event";

export const runtime = 'nodejs';


export async function GET() {
    try {
        const TARGET_URL = "https://www.w3schools.com/html/html_forms.asp";
        const USER_INTENT = "I want to fill the form with my name John Doe and register.";

        console.log("🧪 Triggering Auto-Apply Test via API...");
        const result = await applyToEvent(TARGET_URL, USER_INTENT);

        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
