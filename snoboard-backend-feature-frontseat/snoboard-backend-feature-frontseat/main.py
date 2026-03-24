"""
Google Cloud Functions entry point.

This module provides the HTTP handler for Google Cloud Functions deployment.
It wraps the FastAPI application to work with the functions-framework.
"""

import functions_framework
from flask import Request, Response, make_response
import json

# Import the FastAPI app
from app.main import app
from app.schemas.request import ScrapeRequest
from app.services.scraper_orchestrator import scrape_all_platforms_sync
# from app.services.report_generator import create_report_data
from app.database.repositories.creator import get_creator_repository
from app.database.repositories.report import get_report_repository


@functions_framework.http
def handler(request: Request) -> Response:
    """
    HTTP Cloud Function entry point.

    This handler routes requests to the appropriate endpoint based on the path.

    Args:
        request: Flask Request object.

    Returns:
        Flask Response object.
    """
    path = request.path
    method = request.method

    # Health check endpoints
    if path in ["/", "/health"] and method == "GET":
        return make_response(
            json.dumps({"status": "healthy", "version": "1.0.0"}),
            200,
            {"Content-Type": "application/json"},
        )

    # Scrape endpoint
    if path == "/api/v1/scrape" and method == "POST":
        return handle_scrape(request)

    # Report endpoints
    if path.startswith("/api/v1/report/") and method == "GET":
        report_id = path.replace("/api/v1/report/", "").rstrip("/")
        
        if report_id.endswith("/csv"):
            report_id = report_id.replace("/csv", "")
            return handle_get_report_csv(report_id)
        else:
            return handle_get_report(report_id)

    # Not found
    return make_response(
        json.dumps({"error": "Not found", "path": path}),
        404,
        {"Content-Type": "application/json"},
    )


def handle_scrape(request: Request) -> Response:
    """Handle the /api/v1/scrape endpoint."""
    try:
        # Parse request body
        request_data = request.get_json(silent=True)
        if not request_data:
            return make_response(
                json.dumps({"success": False, "error": "Invalid JSON body"}),
                400,
                {"Content-Type": "application/json"},
            )

        urls = request_data.get("urls", [])
        if not urls:
            return make_response(
                json.dumps({"success": False, "error": "No URLs provided"}),
                400,
                {"Content-Type": "application/json"},
            )

        # Scrape all platforms synchronously (GCF doesn't support async well)
        scrape_result = scrape_all_platforms_sync(urls)

        # Store creators
        creator_repo = get_creator_repository()
        creators_stored = creator_repo.bulk_upsert_creators(scrape_result.creators)

        # Generate report
        report_data = create_report_data(scrape_result.posts, urls)

        # Save report
        report_repo = get_report_repository()
        saved_report = report_repo.save_report(report_data)
        report_id = saved_report.get("id", "") if saved_report else ""

        # Build response
        response_data = {
            "success": True,
            "report_id": report_id,
            "report_csv": report_data.file_content,
            "posts": [
                {
                    "url": post.url,
                    "platform": post.platform,
                    "creator_handle": post.creator_handle,
                    "views": post.views,
                    "likes": post.likes,
                    "comments": post.comments,
                    "shares": post.shares,
                    "quotes": post.quotes,
                    "bookmarks": post.bookmarks,
                    "post_id": post.post_id,
                    "posted_at": post.posted_at,
                }
                for post in scrape_result.posts
            ],
            "aggregated": {
                "total_posts": report_data.metrics.total_posts,
                "total_views": report_data.metrics.total_views,
                "total_likes": report_data.metrics.total_likes,
                "total_comments": report_data.metrics.total_comments,
                "total_shares": report_data.metrics.total_shares,
                "total_quotes": report_data.metrics.total_quotes,
                "total_bookmarks": report_data.metrics.total_bookmarks,
                "by_platform": {
                    "instagram": report_data.metrics.instagram_posts,
                    "linkedin": report_data.metrics.linkedin_posts,
                    "twitter": report_data.metrics.twitter_posts,
                },
            },
            "creators_stored": creators_stored,
            "errors": scrape_result.errors,
        }

        return make_response(
            json.dumps(response_data),
            200,
            {"Content-Type": "application/json"},
        )

    except Exception as e:
        return make_response(
            json.dumps({"success": False, "error": str(e)}),
            500,
            {"Content-Type": "application/json"},
        )


def handle_get_report(report_id: str) -> Response:
    """Handle GET /api/v1/report/{report_id}."""
    report_repo = get_report_repository()
    report = report_repo.get_report(report_id)

    if not report:
        return make_response(
            json.dumps({"error": f"Report not found: {report_id}"}),
            404,
            {"Content-Type": "application/json"},
        )

    return make_response(
        json.dumps(report, default=str),
        200,
        {"Content-Type": "application/json"},
    )


def handle_get_report_csv(report_id: str) -> Response:
    """Handle GET /api/v1/report/{report_id}/csv."""
    report_repo = get_report_repository()
    csv_content = report_repo.get_report_csv(report_id)

    if not csv_content:
        return make_response(
            json.dumps({"error": f"Report not found: {report_id}"}),
            404,
            {"Content-Type": "application/json"},
        )

    return make_response(
        json.dumps({"csv": csv_content}),
        200,
        {"Content-Type": "application/json"},
    )


# For local development with uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
