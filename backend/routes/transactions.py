from datetime import date
from flask import Blueprint, request, jsonify, g

from extensions import db
from models import Transaction
from utils.auth_middleware import login_required
from services.gemma_service import parse_entry_with_gemma
from services.sahara_service import transcribe_audio, SaharaTranscriptionError

transactions_bp = Blueprint("transactions", __name__)


def _parse_and_save(text):
    """
    Shared logic: takes raw text (from typing OR from a Sahara transcript),
    runs it through Gemma, and saves any valid transactions.
    Returns (summary, saved_transactions_list).
    Raises ValueError if Gemma parsing fails.
    """
    result = parse_entry_with_gemma(text)

    saved_transactions = []

    for tx in result.get("transactions", []):
        try:
            amount = float(tx.get("amount", 0))
        except (TypeError, ValueError):
            continue  # skip malformed entries rather than failing the whole request

        if amount <= 0 or tx.get("type") not in ("income", "expense"):
            continue

        transaction = Transaction(
            user_id=g.user_id,
            type=tx["type"],
            category=(tx.get("category") or "other").lower(),
            amount=amount,
            description=tx.get("description"),
            raw_text=text,
            date=date.today(),
        )
        db.session.add(transaction)
        saved_transactions.append(transaction)

    db.session.commit()

    return result.get("summary", ""), saved_transactions


@transactions_bp.route("/analyze", methods=["POST"])
@login_required
def analyze():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "Please describe what happened, e.g. 'sold rice for 5000'."}), 400

    try:
        summary, saved_transactions = _parse_and_save(text)
    except ValueError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify(
        {
            "summary": summary,
            "transactions": [t.to_dict() for t in saved_transactions],
        }
    ), 200


@transactions_bp.route("/analyze-voice", methods=["POST"])
@login_required
def analyze_voice():
    """
    Accepts a recorded voice clip (sent as multipart/form-data under the
    key 'audio'), sends it to Sahara to get a transcript, then runs that
    transcript through the exact same Gemma parsing + saving logic as
    the typed /analyze route.
    """
    if "audio" not in request.files:
        return jsonify({"error": "No audio file received."}), 400

    audio_file = request.files["audio"]

    if audio_file.filename == "":
        return jsonify({"error": "No audio file received."}), 400

    language = request.form.get("language", "en")

    try:
        transcript = transcribe_audio(audio_file, language=language)
    except SaharaTranscriptionError as e:
        return jsonify({"error": f"Voice transcription failed: {e}"}), 502

    if not transcript.strip():
        return jsonify({"error": "Could not make out any speech in that recording. Try again."}), 400

    try:
        summary, saved_transactions = _parse_and_save(transcript)
    except ValueError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify(
        {
            "transcript": transcript,
            "summary": summary,
            "transactions": [t.to_dict() for t in saved_transactions],
        }
    ), 200


@transactions_bp.route("/transactions", methods=["GET"])
@login_required
def list_transactions():
    limit = request.args.get("limit", default=20, type=int)
    offset = request.args.get("offset", default=0, type=int)

    limit = max(1, min(limit, 100))  # clamp to a sane range
    offset = max(0, offset)

    query = (
        Transaction.query.filter_by(user_id=g.user_id)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    transactions = [t.to_dict() for t in query.all()]

    return jsonify({"transactions": transactions}), 200