FROM php:8.4-fpm-alpine

# Install system dependencies
RUN apk add --no-cache \
    curl \
    freetype-dev \
    icu-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libxml2-dev \
    libzip-dev \
    oniguruma-dev \
    zip \
    unzip \
    git \
    linux-headers \
    $PHPIZE_DEPS

# Install PHP extensions
RUN docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_mysql \
        mbstring \
        xml \
        bcmath \
        zip \
        gd \
        intl \
        opcache \
        pcntl \
        exif

# Install Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# Copy custom PHP config
COPY php.ini /usr/local/etc/php/conf.d/99-custom.ini

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install Node.js 22
RUN apk add --no-cache nodejs npm

# Create user with host UID for permission compatibility
ARG UID=1000
ARG GID=1000
RUN addgroup -g ${GID} laravel \
    && adduser -u ${UID} -G laravel -s /bin/sh -D laravel

# Set working directory
WORKDIR /var/www/html

USER laravel

EXPOSE 9000

CMD ["php-fpm"]
