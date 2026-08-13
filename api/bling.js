grant_type: "authorization_code",
          code: code
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      success: true,
      message: "Bling conectado com sucesso.",
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type
    });

  } catch (error) {
    return res.status(500).json({
      error: "Erro ao conectar com o Bling.",
      details: error.message
    });
  }
}
