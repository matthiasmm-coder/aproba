-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'GESTOR', 'ASISTENTE');

-- CreateEnum
CREATE TYPE "WorkspaceTipo" AS ENUM ('GESTORIA', 'DESPACHO_JURIDICO', 'MIXTO');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionEstado" AS ENUM ('TRIAL', 'ACTIVA', 'PAST_DUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoTramite" AS ENUM ('NIE', 'TIE', 'ARRAIGO_SOCIAL', 'ARRAIGO_LABORAL', 'ARRAIGO_FAMILIAR', 'REAGRUPACION', 'RENOVACION', 'RESIDENCIA_LARGA', 'NACIONALIDAD', 'OTRO');

-- CreateEnum
CREATE TYPE "ExpedienteEstado" AS ENUM ('BORRADOR', 'DOCS_PENDIENTES', 'DOCS_VALIDADOS', 'FORM_GENERADO', 'PRESENTADO', 'RESUELTO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "DocumentoTipo" AS ENUM ('PASAPORTE', 'TARJETA_RESIDENCIA_TIE', 'CERTIFICADO_NIE', 'EMPADRONAMIENTO', 'CONTRATO_TRABAJO', 'NOMINA', 'ANTECEDENTES_PENALES', 'CERTIFICADO_BANCARIO', 'LIBRO_FAMILIA', 'TITULO_ESTUDIOS', 'OTRO');

-- CreateEnum
CREATE TYPE "DocumentoEstado" AS ENUM ('PENDIENTE', 'PROCESANDO', 'VALIDADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "FormularioTipo" AS ENUM ('EX15', 'EX17', 'EX18', 'EX19', 'TASA_790_012');

-- CreateEnum
CREATE TYPE "FacturaEstado" AS ENUM ('BORRADOR', 'EMITIDA', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EventoTipo" AS ENUM ('CREADO', 'DOC_SUBIDO', 'DOC_VALIDADO', 'DOC_RECHAZADO', 'FORM_GENERADO', 'ESTADO_CAMBIADO', 'PRESENTADO', 'NOTIFICACION_ENVIADA', 'COMENTARIO');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "WorkspaceTipo" NOT NULL DEFAULT 'GESTORIA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GESTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFeature" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkspaceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "estado" "SubscriptionEstado" NOT NULL DEFAULT 'TRIAL',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "nacionalidad" TEXT,
    "numeroDocumento" TEXT,
    "idioma" TEXT DEFAULT 'es',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expediente" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "tipo" "TipoTramite" NOT NULL,
    "estado" "ExpedienteEstado" NOT NULL DEFAULT 'BORRADOR',
    "asignadoAId" TEXT,
    "notas" TEXT,
    "fechaPresentacion" TIMESTAMP(3),
    "fechaLimite" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expediente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "DocumentoTipo" NOT NULL,
    "estado" "DocumentoEstado" NOT NULL DEFAULT 'PENDIENTE',
    "nombreArchivo" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "tipoDetectado" TEXT NOT NULL,
    "confianzaGlobal" DOUBLE PRECISION NOT NULL,
    "legibilidad" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "alertas" TEXT[],
    "modelo" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formulario" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "FormularioTipo" NOT NULL,
    "pdfPath" TEXT,
    "datos" JSONB NOT NULL,
    "generadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpedienteEvento" (
    "id" TEXT NOT NULL,
    "expedienteId" TEXT NOT NULL,
    "tipo" "EventoTipo" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpedienteEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expedienteId" TEXT,
    "numero" TEXT NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "baseImponible" DECIMAL(10,2) NOT NULL,
    "iva" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "estado" "FacturaEstado" NOT NULL DEFAULT 'BORRADOR',
    "fechaEmision" TIMESTAMP(3),
    "fechaVencimiento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_workspaceId_idx" ON "Membership"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_workspaceId_key" ON "Membership"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFeature_workspaceId_feature_key" ON "WorkspaceFeature"("workspaceId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE INDEX "Cliente_workspaceId_idx" ON "Cliente"("workspaceId");

-- CreateIndex
CREATE INDEX "Expediente_workspaceId_estado_idx" ON "Expediente"("workspaceId", "estado");

-- CreateIndex
CREATE INDEX "Expediente_clienteId_idx" ON "Expediente"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Expediente_workspaceId_referencia_key" ON "Expediente"("workspaceId", "referencia");

-- CreateIndex
CREATE INDEX "Documento_expedienteId_idx" ON "Documento"("expedienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_documentoId_key" ON "Extraction"("documentoId");

-- CreateIndex
CREATE INDEX "Formulario_expedienteId_idx" ON "Formulario"("expedienteId");

-- CreateIndex
CREATE INDEX "ExpedienteEvento_expedienteId_idx" ON "ExpedienteEvento"("expedienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_expedienteId_key" ON "Factura"("expedienteId");

-- CreateIndex
CREATE INDEX "Factura_workspaceId_estado_idx" ON "Factura"("workspaceId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_workspaceId_numero_key" ON "Factura"("workspaceId", "numero");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFeature" ADD CONSTRAINT "WorkspaceFeature_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expediente" ADD CONSTRAINT "Expediente_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Formulario" ADD CONSTRAINT "Formulario_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteEvento" ADD CONSTRAINT "ExpedienteEvento_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpedienteEvento" ADD CONSTRAINT "ExpedienteEvento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_expedienteId_fkey" FOREIGN KEY ("expedienteId") REFERENCES "Expediente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

