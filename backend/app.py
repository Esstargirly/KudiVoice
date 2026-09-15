from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from extensions import db, bcrypt
from routes.auth import auth_bp
from routes.transactions import transactions_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    bcrypt.init_app(app)

    CORS(
        app,
        resources={r"/*": {"origins": app.config["FRONTEND_ORIGINS"]}},
        supports_credentials=True,
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(transactions_bp)

    @app.route("/")
    def health_check():
        return jsonify({"status": "KudiVoice backend is running"}), 200

    with app.app_context():
        db.create_all() 

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)