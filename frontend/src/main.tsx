import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./estilo.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import { iniciarPresenca } from "./api/presenca";
import { tema } from "./tema";

iniciarPresenca();

const consultas = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider theme={tema} defaultColorScheme="light">
      <Notifications position="bottom-right" limit={3} autoClose={3500} />
      <QueryClientProvider client={consultas}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  </React.StrictMode>,
);
