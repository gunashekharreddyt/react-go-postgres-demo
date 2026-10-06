import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";

import {
  Add,
  Delete,
  Edit,
  People,
  Search,
} from "@mui/icons-material";

const API_URL = "http://localhost:8080/api/users";

function App() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
  });

  const [formErrors, setFormErrors] = useState({
    name: "",
    email: "",
  });

  const [search, setSearch] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const [notification, setNotification] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);

      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = await response.json();

      setUsers(data);
    } catch (error) {
      showNotification(
        "Unable to connect to the Go backend",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  function showNotification(message, severity = "success") {
    setNotification({
      open: true,
      message,
      severity,
    });
  }

  function closeNotification() {
    setNotification((previous) => ({
      ...previous,
      open: false,
    }));
  }

  function openAddDialog() {
    setEditingUser(null);

    setForm({
      name: "",
      email: "",
    });

    setFormErrors({
      name: "",
      email: "",
    });

    setDialogOpen(true);
  }

  function openEditDialog(user) {
    setEditingUser(user);

    setForm({
      name: user.name,
      email: user.email,
    });

    setFormErrors({
      name: "",
      email: "",
    });

    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setFormErrors((previous) => ({
      ...previous,
      [name]: "",
    }));
  }

  function validateForm() {
    const errors = {};

    const name = form.name.trim();
    const email = form.email.trim();

    if (!name) {
      errors.name = "Name is required";
    } else if (name.length < 2) {
      errors.name = "Name must contain at least 2 characters";
    } else if (name.length > 50) {
      errors.name = "Name must not exceed 50 characters";
    } else if (!/^[A-Za-z ]+$/.test(name)) {
      errors.name = "Only letters and spaces are allowed";
    }

    if (!email) {
      errors.email = "Email is required";
    } else if (
      !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
    ) {
      errors.email = "Enter a valid email address";
    }

    setFormErrors({
      name: errors.name || "",
      email: errors.email || "",
    });

    return Object.keys(errors).length === 0;
  }

  async function saveUser() {
    if (!validateForm()) {
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
    };

    try {
      const url = editingUser
        ? `${API_URL}?id=${editingUser.id}`
        : API_URL;

      const method = editingUser ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed");
      }

      showNotification(
        editingUser
          ? "User updated successfully"
          : "User created successfully"
      );

      closeDialog();

      await fetchUsers();
    } catch (error) {
      showNotification(error.message, "error");
    }
  }

  function openDeleteDialog(user) {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  }

  function closeDeleteDialog() {
    setDeleteDialogOpen(false);
    setUserToDelete(null);
  }

  async function deleteUser() {
    if (!userToDelete) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}?id=${userToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Delete failed");
      }

      showNotification("User deleted successfully");

      closeDeleteDialog();

      await fetchUsers();
    } catch (error) {
      showNotification(error.message, "error");
    }
  }

  const filteredUsers = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    if (!searchText) {
      return users;
    }

    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(searchText) ||
        user.email.toLowerCase().includes(searchText)
    );
  }, [users, search]);

  return (
    <Box className="app-background">
      <AppBar
        position="static"
        elevation={0}
        className="top-bar"
      >
        <Toolbar>
          <People sx={{ mr: 1.5 }} />

          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              flexGrow: 1,
            }}
          >
            User Management
          </Typography>

          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={openAddDialog}
            className="add-button"
          >
            Add User
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 5 }}>
        <Stack spacing={1} sx={{ mb: 4 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: "#172033",
            }}
          >
            Users
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
          >
            Manage users stored in PostgreSQL through your Go REST API.
          </Typography>
        </Stack>

        <Card className="dashboard-card">
          <CardContent sx={{ p: 3 }}>
            <Stack
              direction={{
                xs: "column",
                sm: "row",
              }}
              spacing={2}
              alignItems={{
                xs: "stretch",
                sm: "center",
              }}
              justifyContent="space-between"
              sx={{ mb: 3 }}
            >
              <Box>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 700 }}
                >
                  User Directory
                </Typography>

                <Typography
                  variant="body2"
                  color="text.secondary"
                >
                  {users.length} total user
                  {users.length !== 1 ? "s" : ""}
                </Typography>
              </Box>

              <TextField
                size="small"
                placeholder="Search users..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                sx={{
                  width: {
                    xs: "100%",
                    sm: 300,
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>

            <Divider />

            {loading ? (
              <Box className="loading-container">
                <CircularProgress />
              </Box>
            ) : filteredUsers.length === 0 ? (
              <Box className="empty-state">
                <People sx={{ fontSize: 55, opacity: 0.35 }} />

                <Typography
                  variant="h6"
                  sx={{ mt: 1, fontWeight: 700 }}
                >
                  No users found
                </Typography>

                <Typography
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Add your first user to get started.
                </Typography>

                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={openAddDialog}
                >
                  Add User
                </Button>
              </Box>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <table className="user-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>#{user.id}</td>

                        <td>
                          <Typography fontWeight={600}>
                            {user.name}
                          </Typography>
                        </td>

                        <td>{user.email}</td>

                        <td>
                          {new Date(
                            user.created_at
                          ).toLocaleDateString()}
                        </td>

                        <td>
                          <Stack
                            direction="row"
                            spacing={1}
                          >
                            <IconButton
                              color="primary"
                              onClick={() =>
                                openEditDialog(user)
                              }
                            >
                              <Edit />
                            </IconButton>

                            <IconButton
                              color="error"
                              onClick={() =>
                                openDeleteDialog(user)
                              }
                            >
                              <Delete />
                            </IconButton>
                          </Stack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </CardContent>
        </Card>
      </Container>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingUser ? "Edit User" : "Add User"}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={Boolean(formErrors.name)}
              helperText={formErrors.name}
              fullWidth
              autoFocus
            />

            <TextField
              label="Email"
              name="email"
              value={form.email}
              onChange={handleChange}
              error={Boolean(formErrors.email)}
              helperText={formErrors.email}
              fullWidth
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={closeDialog}>
            Cancel
          </Button>

          <Button
            variant="contained"
            onClick={saveUser}
          >
            {editingUser ? "Update User" : "Create User"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Delete User
        </DialogTitle>

        <DialogContent>
          <Typography>
            Are you sure you want to delete{" "}
            <strong>{userToDelete?.name}</strong>?
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={closeDeleteDialog}>
            Cancel
          </Button>

          <Button
            variant="contained"
            color="error"
            onClick={deleteUser}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={3500}
        onClose={closeNotification}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
      >
        <Alert
          severity={notification.severity}
          onClose={closeNotification}
          variant="filled"
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;