import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import fetcher from "../http/RequestConfig";
import { useSelector } from 'react-redux';

export const login = createAsyncThunk("user/login", async (payload, thunk) => {
  var requestPath = "login";
  if ("email" in payload && "password" in payload){
    requestPath += "?email=" + payload["email"] + "&password=" + payload["password"];
  }
  if ("product_hash" in payload) {
    if ("email" in payload && "password" in payload) {
      requestPath += "&";
    } else {
      requestPath += "?";
    }
    requestPath += "product_hash=" + payload["product_hash"];
    requestPath += "&free_trial_code=" + payload["free_trial_code"];
  }
  const response = await fetcher(requestPath, {
      credentials: 'include',
  });
  const response_str = await response.json();
  if ("auth_url" in response_str) {
    window.location.assign(response_str.auth_url);
  }
  return response_str;
});

export const logout = createAsyncThunk("user/logout", async (thunk) => {
    // Forget the accessToken and refreshToken
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("sessionToken");

    // Return an empty response
    return {};
});

export const signUp = createAsyncThunk("user/signUp", async (payload, thunk) => {
  const response = await fetcher("signUp", {
    method: "POST",
    headers: {
    'Accept': 'application/json',
    'Content-type': 'application/json',
    },
    body: JSON.stringify(payload)
})
  const response_str = await response.json();
  return response_str;
});

export const forgotPassword = createAsyncThunk("user/forgotPassword", async (payload, thunk) => {
  const response = await fetcher("forgotPassword", {
    method: "POST",
    headers: {
    'Accept': 'application/json',
    'Content-type': 'application/json',
    },
    body: JSON.stringify(payload)
  })
  const response_str = await response.json();
  return response_str;
});

export const resetPassword = createAsyncThunk("user/resetPassword", async (payload, thunk) => {
  const response = await fetcher("resetPassword", {
    method: "POST",
    headers: {
    'Accept': 'application/json',
    'Content-type': 'application/json',
    },
    body: JSON.stringify(payload)
})
  const response_str = await response.json();
  return response_str;
});

export const viewUser = createAsyncThunk("user/viewUser", async (thunk) => {
  const response = await fetcher("viewUser");
  const response_str = await response.json();
  return response_str;
});

// Gets the number of credits and refreshes it if first of the month
export const refreshCredits = createAsyncThunk("user/refreshCredits", async (payload, thunk) => {
    const response = await fetcher("refreshCredits", {
        method: "POST",
        headers: {
        'Accept': 'application/json',
        'Content-type': 'application/json',
        },
        body: JSON.stringify(payload)
    })
    const response_str = await response.json();
    return response_str;
});

export const createCheckoutSession = createAsyncThunk("user/createCheckoutSession", async (payload, thunk) => {
  console.log(payload);
  const response = await fetcher("createCheckoutSession", {
    method: "POST",
    headers: {
    'Accept': 'application/json',
    'Content-type': 'application/json',
    },
    body: JSON.stringify(payload)
})
  const response_str = await response.json();
  return response_str["url"];
});

export const createPortalSession = createAsyncThunk("user/createPortalSession", async (payload, thunk) => {
  const response = await fetcher("createPortalSession", {
    method: "POST",
    headers: {
    'Accept': 'application/json',
    'Content-type': 'application/json',
    },
    body: JSON.stringify(payload)
  })
  const response_str = await response.json();
  return response_str["url"];
});

export function useUser() {
  return useSelector((state) => {
      try {
        return state.userReducer.entities.users.byId[state.userReducer.currentUser];
      } catch (e) {
        return null;
      }
  });
}

export function useNumCredits() {
  return useSelector((state) => {
      return state.userReducer.numCredits;
  });
}

export function useAccessTokenIsSet() {
  return useSelector((state) => { return "accessToken" in state.userReducer})
};
export function useRefreshTokenIsSet() {
  return useSelector((state) => { return "refreshToken" in state.userReducer});
};
export function useAccessToken() {
  return useSelector((state) => { return state.userReducer.accessToken});
};
export function useRefreshToken() {
  return useSelector((state) => { return state.userReducer.refreshToken});
};

function clearUser(state) {
  state.currentUser = 0;
  state.entities.users.allIds = [];
  state.entities.users.byId = {};
}

export const initialState = {
    // entities holds all normalized data.
    // Initialized to be empty, but we comment the structure for documentation purposes.
    entities: {
        users: {
            byId : {
                // "user1" : {
                //     id : "user1",
                //     personName: "user name",
                //     email: "email",
                //     privilegeLevel: 0,
                // }
            },
            allIds : [
                // "user1"
            ]
        }
    },
    // ID of current user.  0 is for unset.
    currentUser: 0,
    numCredits: 0,
 };

 export const userSlice = createSlice({
    name: "user",
    initialState: initialState,
    reducers: {
      removeAccessTokenIfExists: (state) => {
        if ("accessToken" in state) {
          delete state.accessToken;
        }
      },
      removeRefreshTokenIfExists: (state) => {
        if ("refreshToken" in state) {
          delete state.refreshToken;
        }
      },
      setAccessToken: (state, action) => {
        state.accessToken = action.payload;
      },
      setRefreshToken: (state, action) => {
        state.refreshToken = action.payload;
      },
    },
    extraReducers: (builder) => {
      builder
        .addCase(refreshCredits.fulfilled, (state, action) => {
          state.numCredits = action.payload["numCredits"];
        })
        .addCase(viewUser.fulfilled, (state, action) => {
          clearUser(state);
          var id = action.payload["id"];
          state.currentUser = id;
          state.entities.users.allIds.push(id);
          state.entities.users.byId[id] = action.payload;
        });
    },
  });

  export const {
    removeAccessTokenIfExists,
    removeRefreshTokenIfExists,
    setAccessToken,
    setRefreshToken,
  } = userSlice.actions;
