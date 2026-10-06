package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	dbHost     = "127.0.0.1"
	dbPort     = "5432"
	dbUser     = "demo_user"
	dbPassword = "DemoPass123!"
	dbName     = "userdb"
)

var db *pgxpool.Pool

type User struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type UserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type ErrorResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func main() {
	ctx := context.Background()

	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s",
		dbUser,
		dbPassword,
		dbHost,
		dbPort,
		dbName,
	)

	var err error

	db, err = pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal("Failed to create PostgreSQL connection pool:", err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		log.Fatal("Failed to connect to PostgreSQL:", err)
	}

	log.Println("Connected to PostgreSQL successfully")

	if err := createUsersTable(ctx); err != nil {
		log.Fatal("Failed to create users table:", err)
	}

	http.HandleFunc("/api/health", healthHandler)
	http.HandleFunc("/api/users", usersHandler)

	log.Println("Go API running on:")
	log.Println("http://localhost:8080")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}

func createUsersTable(ctx context.Context) error {
	query := `
	CREATE TABLE IF NOT EXISTS users (
		id SERIAL PRIMARY KEY,
		name VARCHAR(50) NOT NULL,
		email VARCHAR(150) NOT NULL UNIQUE,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := db.Exec(ctx, query)
	return err
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	setCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodGet {
		sendError(w, http.StatusMethodNotAllowed, "Only GET is allowed")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "Go API and PostgreSQL are working",
	})
}

func usersHandler(w http.ResponseWriter, r *http.Request) {
	setCORS(w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		getUsers(w, r)

	case http.MethodPost:
		createUser(w, r)

	case http.MethodPut:
		updateUser(w, r)

	case http.MethodDelete:
		deleteUser(w, r)

	default:
		sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}

func getUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := db.Query(ctx, `
		SELECT id, name, email, created_at
		FROM users
		ORDER BY id DESC
	`)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to fetch users")
		return
	}
	defer rows.Close()

	users := []User{}

	for rows.Next() {
		var user User

		err := rows.Scan(
			&user.ID,
			&user.Name,
			&user.Email,
			&user.CreatedAt,
		)

		if err != nil {
			sendError(w, http.StatusInternalServerError, "Failed to read user data")
			return
		}

		users = append(users, user)
	}

	if err := rows.Err(); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to read users")
		return
	}

	sendJSON(w, http.StatusOK, users)
}

func createUser(w http.ResponseWriter, r *http.Request) {
	var request UserRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON request")
		return
	}

	request.Name = strings.TrimSpace(request.Name)
	request.Email = strings.TrimSpace(strings.ToLower(request.Email))

	if err := validateUser(request); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()

	var user User

	query := `
		INSERT INTO users (name, email)
		VALUES ($1, $2)
		RETURNING id, name, email, created_at
	`

	err := db.QueryRow(
		ctx,
		query,
		request.Name,
		request.Email,
	).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.CreatedAt,
	)

	if err != nil {
		if isDuplicateEmailError(err) {
			sendError(w, http.StatusConflict, "Email already exists")
			return
		}

		log.Println("Create user error:", err)
		sendError(w, http.StatusInternalServerError, "Failed to create user")
		return
	}

	sendJSON(w, http.StatusCreated, user)
}

func updateUser(w http.ResponseWriter, r *http.Request) {
	idText := r.URL.Query().Get("id")

	if idText == "" {
		sendError(w, http.StatusBadRequest, "User ID is required")
		return
	}

	id, err := strconv.Atoi(idText)
	if err != nil || id <= 0 {
		sendError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	var request UserRequest

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		sendError(w, http.StatusBadRequest, "Invalid JSON request")
		return
	}

	request.Name = strings.TrimSpace(request.Name)
	request.Email = strings.TrimSpace(strings.ToLower(request.Email))

	if err := validateUser(request); err != nil {
		sendError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()

	var user User

	query := `
		UPDATE users
		SET name = $1, email = $2
		WHERE id = $3
		RETURNING id, name, email, created_at
	`

	err = db.QueryRow(
		ctx,
		query,
		request.Name,
		request.Email,
		id,
	).Scan(
		&user.ID,
		&user.Name,
		&user.Email,
		&user.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			sendError(w, http.StatusNotFound, "User not found")
			return
		}

		if isDuplicateEmailError(err) {
			sendError(w, http.StatusConflict, "Email already exists")
			return
		}

		log.Println("Update user error:", err)
		sendError(w, http.StatusInternalServerError, "Failed to update user")
		return
	}

	sendJSON(w, http.StatusOK, user)
}

func deleteUser(w http.ResponseWriter, r *http.Request) {
	idText := r.URL.Query().Get("id")

	if idText == "" {
		sendError(w, http.StatusBadRequest, "User ID is required")
		return
	}

	id, err := strconv.Atoi(idText)
	if err != nil || id <= 0 {
		sendError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	ctx := r.Context()

	commandTag, err := db.Exec(
		ctx,
		"DELETE FROM users WHERE id = $1",
		id,
	)

	if err != nil {
		log.Println("Delete user error:", err)
		sendError(w, http.StatusInternalServerError, "Failed to delete user")
		return
	}

	if commandTag.RowsAffected() == 0 {
		sendError(w, http.StatusNotFound, "User not found")
		return
	}

	sendJSON(w, http.StatusOK, map[string]string{
		"status":  "success",
		"message": "User deleted successfully",
	})
}

func validateUser(user UserRequest) error {
	if user.Name == "" {
		return errors.New("name is required")
	}

	if len([]rune(user.Name)) < 2 {
		return errors.New("name must contain at least 2 characters")
	}

	if len([]rune(user.Name)) > 50 {
		return errors.New("name must not exceed 50 characters")
	}

	namePattern := regexp.MustCompile(`^[A-Za-z ]+$`)

	if !namePattern.MatchString(user.Name) {
		return errors.New("name can contain only letters and spaces")
	}

	if user.Email == "" {
		return errors.New("email is required")
	}

	if len([]rune(user.Email)) > 150 {
		return errors.New("email must not exceed 150 characters")
	}

	emailPattern := regexp.MustCompile(
		`^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$`,
	)

	if !emailPattern.MatchString(user.Email) {
		return errors.New("invalid email format")
	}

	return nil
}

func isDuplicateEmailError(err error) bool {
	return strings.Contains(
		strings.ToLower(err.Error()),
		"duplicate key value",
	)
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, OPTIONS",
	)
}

func sendJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Println("JSON response error:", err)
	}
}

func sendError(w http.ResponseWriter, statusCode int, message string) {
	sendJSON(w, statusCode, ErrorResponse{
		Status:  "error",
		Message: message,
	})
}
